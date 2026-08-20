import { type Application } from "express";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  generateAssetImage,
  generateSceneImage,
  generateSceneVideo,
  cancelActiveRender,
} from "./render-media";
import { generateMovieStudioBible } from "./agent/agent-backend";
import { movieStudioStateFile } from "./agent/workspace";

const APP_DATA_DIR = join(homedir(), "media-studio");
const TASKS_DIR = join(APP_DATA_DIR, "tasks");

const PROJECT_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

// ========== Types ==========

export type QueueTaskType =
  | "generate"
  | "render"
  | "render-assets"
  | "render-videos"
  | "render-scene-images"
  | "regenerate-asset"
  | "regenerate-video"
  | "regenerate-scene-image";

export type QueueTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface QueueTask {
  id: string;
  type: QueueTaskType;
  label: string;
  status: QueueTaskStatus;
  progress: { current: number; total: number } | null;
  statusText: string | null;
  error: string | null;
  payload: any;
  result: any;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

// ========== Queue file persistence ==========

function queueDir(projectId: string): string {
  return join(TASKS_DIR, projectId);
}

function queueFile(projectId: string): string {
  return join(queueDir(projectId), "queue.json");
}

function slugify(v: unknown): string {
  return String(v || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function isValidProjectId(id: string): boolean {
  return PROJECT_ID_RE.test(id);
}

interface QueueState {
  tasks: QueueTask[];
}

// In-memory queues, keyed by project id. Persisted to disk on every mutation so
// the queue survives app restarts and is visible at tasks/:projectId/queue.json.
const queues = new Map<string, QueueState>();

// Global FIFO enqueue order so pending tasks are picked in submission order
// across projects (there is a single GPU worker).
const order: { projectId: string; taskId: string }[] = [];

let pumping = false;
let runningRef: { projectId: string; taskId: string } | null = null;
let runningAbort: AbortController | null = null;

// Resolves the `uv` binary, injected by core.ts on startup.
let resolveUvPath: () => Promise<string> = async () => {
  throw new Error("uv path not configured");
};

function loadState(projectId: string): QueueState {
  const existing = queues.get(projectId);
  if (existing) return existing;

  const file = queueFile(projectId);
  let tasks: QueueTask[] = [];
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf-8"));
      if (Array.isArray(parsed)) {
        tasks = parsed;
      }
    } catch {
      // Corrupt queue file — start fresh.
      tasks = [];
    }
  }

  // A task left "running" by a previous session was interrupted — reset it so
  // the worker picks it back up.
  for (const t of tasks) {
    if (t.status === "running") {
      t.status = "pending";
      t.startedAt = null;
    }
  }

  const state: QueueState = { tasks };
  queues.set(projectId, state);

  // Rebuild the FIFO order for persisted pending tasks so they resume.
  let hasPending = false;
  for (const t of tasks) {
    if (t.status !== "pending") continue;
    hasPending = true;
    if (
      !order.some(
        (o) => o.projectId === projectId && o.taskId === t.id,
      )
    ) {
      order.push({ projectId, taskId: t.id });
    }
  }
  if (hasPending) void pump();

  return state;
}

function persist(projectId: string): void {
  const state = queues.get(projectId);
  if (!state) return;
  const dir = queueDir(projectId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(queueFile(projectId), JSON.stringify(state.tasks, null, 2), "utf-8");
}

function updateTask(
  projectId: string,
  taskId: string,
  patch: Partial<QueueTask>,
): QueueTask | null {
  const state = queues.get(projectId);
  if (!state) return null;
  const index = state.tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return null;
  state.tasks[index] = { ...state.tasks[index], ...patch };
  persist(projectId);
  return state.tasks[index];
}

function enqueue(
  projectId: string,
  type: QueueTaskType,
  label: string,
  payload: any,
): QueueTask {
  const state = loadState(projectId);
  const task: QueueTask = {
    id: randomUUID(),
    type,
    label,
    status: "pending",
    progress: null,
    statusText: null,
    error: null,
    payload,
    result: null,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
  };
  state.tasks.push(task);
  order.push({ projectId, taskId: task.id });
  persist(projectId);
  void pump();
  return task;
}

function nextPending(): { projectId: string; taskId: string } | null {
  for (const entry of order) {
    const state = queues.get(entry.projectId);
    if (!state) continue;
    const task = state.tasks.find((t) => t.id === entry.taskId);
    if (task && task.status === "pending") return entry;
  }
  return null;
}

// ========== Task handlers ==========

interface TaskContext {
  projectId: string;
  task: QueueTask;
  update: (patch: Partial<QueueTask>) => void;
  signal: AbortSignal;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("Aborted");
}

async function runRenderAssets(
  ctx: TaskContext,
  characters: any,
  places: any,
): Promise<{ assets: any[] }> {
  const chars = Array.isArray(characters) ? characters : [];
  const placesList = Array.isArray(places) ? places : [];
  const total = chars.length + placesList.length;
  const assets: any[] = [];
  let current = 0;

  for (const c of chars) {
    throwIfAborted(ctx.signal);
    const slug = slugify(c?.slug);
    const prompt = String(c?.imagePrompt || "").trim();
    if (!slug || !prompt) continue;
    current += 1;
    ctx.update({
      statusText: `Generating character: ${c?.name || slug}`,
      progress: { current, total },
    });
    const r = await generateAssetImage(ctx.projectId, "character", slug, prompt);
    throwIfAborted(ctx.signal);
    if ("error" in r) throw new Error(r.error);
    assets.push({
      kind: "character",
      slug,
      filename: r.filename,
      url: r.url,
      updatedAt: Date.now(),
    });
    ctx.update({ result: { assets: [...assets] } });
  }

  for (const p of placesList) {
    throwIfAborted(ctx.signal);
    const slug = slugify(p?.slug);
    const prompt = String(p?.imagePrompt || "").trim();
    if (!slug || !prompt) continue;
    current += 1;
    ctx.update({
      statusText: `Generating place: ${p?.name || slug}`,
      progress: { current, total },
    });
    const r = await generateAssetImage(ctx.projectId, "place", slug, prompt);
    throwIfAborted(ctx.signal);
    if ("error" in r) throw new Error(r.error);
    assets.push({
      kind: "place",
      slug,
      filename: r.filename,
      url: r.url,
      updatedAt: Date.now(),
    });
    ctx.update({ result: { assets: [...assets] } });
  }

  ctx.update({ result: { assets } });
  return { assets };
}

async function runRenderSceneImages(
  ctx: TaskContext,
  scenes: any,
): Promise<{ sceneImages: any[] }> {
  const list = Array.isArray(scenes) ? scenes : [];
  const total = list.length;
  const sceneImages: any[] = [];
  let current = 0;

  for (const sc of list) {
    throwIfAborted(ctx.signal);
    const slug = slugify(sc?.slug);
    if (!slug) continue;
    current += 1;
    ctx.update({
      statusText: `Generating scene image: ${slug}`,
      progress: { current, total },
    });
    const r = await generateSceneImage(ctx.projectId, sc);
    throwIfAborted(ctx.signal);
    if ("error" in r) throw new Error(r.error);
    sceneImages.push({
      slug,
      filename: r.filename,
      url: r.url,
      updatedAt: Date.now(),
    });
    ctx.update({ result: { sceneImages: [...sceneImages] } });
  }

  ctx.update({ result: { sceneImages } });
  return { sceneImages };
}

async function runRenderVideos(
  ctx: TaskContext,
  uvPath: string,
  scenes: any,
  characters: any,
): Promise<{ videos: any[] }> {
  const list = Array.isArray(scenes) ? scenes : [];
  const chars = Array.isArray(characters) ? characters : [];
  const total = list.length;
  const videos: any[] = [];
  let current = 0;

  for (const sc of list) {
    throwIfAborted(ctx.signal);
    const slug = slugify(sc?.slug);
    if (!slug) continue;
    current += 1;
    ctx.update({
      statusText: `Generating video: ${slug}`,
      progress: { current, total },
    });
    const r = await generateSceneVideo(uvPath, ctx.projectId, sc, chars);
    throwIfAborted(ctx.signal);
    if ("error" in r) throw new Error(r.error);
    videos.push({
      slug,
      filename: r.filename,
      url: r.url,
      updatedAt: Date.now(),
    });
    ctx.update({ result: { videos: [...videos] } });
  }

  ctx.update({ result: { videos } });
  return { videos };
}

async function runFullRender(
  ctx: TaskContext,
  uvPath: string,
  characters: any,
  places: any,
  scenes: any,
): Promise<{
  assets: any[];
  sceneImages: any[];
  videos: any[];
  renderedScenes: any[];
}> {
  const { assets } = await runRenderAssets(ctx, characters, places);
  const { sceneImages } = await runRenderSceneImages(ctx, scenes);
  const { videos } = await runRenderVideos(ctx, uvPath, scenes, characters);

  const imgBySlug = new Map(sceneImages.map((i) => [i.slug, i.url]));
  const vidBySlug = new Map(videos.map((v) => [v.slug, v.url]));
  const renderedScenes = (Array.isArray(scenes) ? scenes : [])
    .map((sc) => {
      const slug = slugify(sc?.slug);
      if (!slug) return null;
      return {
        slug,
        imageUrl: imgBySlug.get(slug) ?? null,
        videoUrl: vidBySlug.get(slug) ?? null,
      };
    })
    .filter(Boolean);

  const result = { assets, sceneImages, videos, renderedScenes };
  ctx.update({ result });
  return result;
}

type Handler = (
  ctx: TaskContext,
  getUvPath: () => Promise<string>,
) => Promise<any>;

const handlers: Record<QueueTaskType, Handler> = {
  generate: async (ctx) => {
    const { idea, model } = ctx.task.payload || {};
    if (typeof idea !== "string" || !idea.trim()) {
      throw new Error("Idea is required");
    }
    return generateMovieStudioBible(
      ctx.projectId,
      idea.trim(),
      typeof model === "string" && model.trim() ? model.trim() : undefined,
    );
  },

  "render-assets": async (ctx) => {
    const { characters, places } = ctx.task.payload || {};
    return runRenderAssets(ctx, characters, places);
  },

  "render-scene-images": async (ctx) => {
    return runRenderSceneImages(ctx, ctx.task.payload?.scenes);
  },

  "render-videos": async (ctx, getUvPath) => {
    const { scenes, characters } = ctx.task.payload || {};
    return runRenderVideos(ctx, await getUvPath(), scenes, characters);
  },

  render: async (ctx, getUvPath) => {
    const { characters, places, scenes } = ctx.task.payload || {};
    return runFullRender(
      ctx,
      await getUvPath(),
      characters,
      places,
      scenes,
    );
  },

  "regenerate-asset": async (ctx) => {
    const { kind, slug, prompt } = ctx.task.payload || {};
    if (kind !== "character" && kind !== "place") {
      throw new Error("kind must be 'character' or 'place'");
    }
    const s = slugify(slug);
    const p = String(prompt || "").trim();
    if (!s || !p) throw new Error("slug and prompt are required");
    const r = await generateAssetImage(ctx.projectId, kind, s, p);
    if ("error" in r) throw new Error(r.error);
    return {
      kind,
      slug: s,
      filename: r.filename,
      url: r.url,
      updatedAt: Date.now(),
    };
  },

  "regenerate-video": async (ctx, getUvPath) => {
    const { scene, characters } = ctx.task.payload || {};
    if (!scene || typeof scene !== "object") throw new Error("scene is required");
    const r = await generateSceneVideo(
      await getUvPath(),
      ctx.projectId,
      scene,
      Array.isArray(characters) ? characters : [],
    );
    if ("error" in r) throw new Error(r.error);
    return {
      slug: slugify(scene?.slug),
      filename: r.filename,
      url: r.url,
      updatedAt: Date.now(),
    };
  },

  "regenerate-scene-image": async (ctx) => {
    const { scene } = ctx.task.payload || {};
    if (!scene || typeof scene !== "object") throw new Error("scene is required");
    const r = await generateSceneImage(ctx.projectId, scene);
    if ("error" in r) throw new Error(r.error);
    return {
      slug: slugify(scene?.slug),
      filename: r.filename,
      url: r.url,
      updatedAt: Date.now(),
    };
  },
};

// ========== Worker ==========

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (true) {
      const next = nextPending();
      if (!next) break;

      const state = queues.get(next.projectId);
      const task = state?.tasks.find((t) => t.id === next.taskId);
      if (!task) break;

      const handler = handlers[task.type];
      if (!handler) {
        updateTask(next.projectId, task.id, {
          status: "failed",
          error: `Unknown task type: ${task.type}`,
          completedAt: Date.now(),
        });
        continue;
      }

      updateTask(next.projectId, task.id, {
        status: "running",
        startedAt: Date.now(),
        statusText: "Starting…",
        error: null,
      });

      const controller = new AbortController();
      runningRef = next;
      runningAbort = controller;

      const ctx: TaskContext = {
        projectId: next.projectId,
        task,
        update: (patch) => updateTask(next.projectId, task.id, patch),
        signal: controller.signal,
      };

      try {
        const result = await handler(ctx, resolveUvPath);
        if (controller.signal.aborted) {
          updateTask(next.projectId, task.id, {
            status: "cancelled",
            statusText: null,
            completedAt: Date.now(),
          });
        } else {
          updateTask(next.projectId, task.id, {
            status: "completed",
            result,
            statusText: null,
            error: null,
            completedAt: Date.now(),
          });
          try {
            syncToMovieStudioState(next.projectId, task.type, result);
          } catch {
            // State sync is best-effort; the queue file is still authoritative.
          }
        }
      } catch (e) {
        if (controller.signal.aborted) {
          updateTask(next.projectId, task.id, {
            status: "cancelled",
            statusText: null,
            completedAt: Date.now(),
          });
        } else {
          updateTask(next.projectId, task.id, {
            status: "failed",
            error: String(e),
            statusText: null,
            completedAt: Date.now(),
          });
        }
      } finally {
        runningRef = null;
        runningAbort = null;
      }
    }
  } finally {
    pumping = false;
  }
}

/** Merge a completed task's result into the movie studio persisted UI state. */
function syncToMovieStudioState(
  projectId: string,
  type: QueueTaskType,
  result: any,
): void {
  const file = movieStudioStateFile(projectId);
  let state: any = {};
  if (existsSync(file)) {
    try {
      state = JSON.parse(readFileSync(file, "utf-8")) || {};
    } catch {
      state = {};
    }
  }

  if (type === "generate" && result) {
    state.result = result;
  }
  if (type === "render-assets" || type === "render") {
    state.assets = Array.isArray(result?.assets) ? result.assets : state.assets ?? [];
  }
  if (type === "render-scene-images" || type === "render") {
    state.sceneImages = Array.isArray(result?.sceneImages)
      ? result.sceneImages
      : state.sceneImages ?? [];
  }
  if (type === "render-videos" || type === "render") {
    state.videos = Array.isArray(result?.videos) ? result.videos : state.videos ?? [];
  }
  if (type === "regenerate-asset" && result) {
    const key = `${result.kind}:${result.slug}`;
    const arr = Array.isArray(state.assets) ? state.assets : [];
    state.assets = [
      ...arr.filter((a: any) => `${a.kind}:${a.slug}` !== key),
      result,
    ];
  }
  if (type === "regenerate-video" && result) {
    const arr = Array.isArray(state.videos) ? state.videos : [];
    state.videos = [
      ...arr.filter((v: any) => v.slug !== result.slug),
      result,
    ];
  }
  if (type === "regenerate-scene-image" && result) {
    const arr = Array.isArray(state.sceneImages) ? state.sceneImages : [];
    state.sceneImages = [
      ...arr.filter((i: any) => i.slug !== result.slug),
      result,
    ];
  }

  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2), "utf-8");
}

// ========== Routes ==========

export function generationQueueSetup({
  app,
  getUvPath,
}: {
  app: Application;
  getUvPath: () => Promise<string>;
}) {
  resolveUvPath = getUvPath;

  // List the current queue for a project.
  app.get("/api/queue", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    res.json(loadState(projectId).tasks);
  });

  // Enqueue a new generation task.
  app.post("/api/queue/enqueue", (req, res) => {
    const { projectId, type, label, payload } = req.body || {};
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (!type || !(type in handlers)) {
      res.status(400).json({ error: "Invalid task type" });
      return;
    }
    const task = enqueue(
      String(projectId),
      type as QueueTaskType,
      typeof label === "string" && label.trim()
        ? label.trim()
        : String(type),
      payload ?? {},
    );
    res.status(201).json(task);
  });

  // Cancel a single task (pending or running).
  app.post("/api/queue/cancel", (req, res) => {
    const { projectId, taskId } = req.body || {};
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const state = queues.get(String(projectId));
    const task = state?.tasks.find((t) => t.id === String(taskId ?? ""));
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    if (task.status === "pending") {
      updateTask(String(projectId), task.id, {
        status: "cancelled",
        completedAt: Date.now(),
      });
    } else if (task.status === "running") {
      if (runningRef && runningRef.taskId === task.id) {
        runningAbort?.abort();
        cancelActiveRender();
      }
    }
    res.json({ ok: true });
  });

  // Cancel every queued/running task for a project (the "Stop" button).
  app.post("/api/queue/cancel-active", (req, res) => {
    const { projectId } = req.body || {};
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const state = queues.get(String(projectId));
    if (state) {
      for (const task of state.tasks) {
        if (task.status === "pending") {
          updateTask(String(projectId), task.id, {
            status: "cancelled",
            completedAt: Date.now(),
          });
        }
      }
    }
    if (
      runningRef &&
      runningRef.projectId === String(projectId)
    ) {
      runningAbort?.abort();
      cancelActiveRender();
    }
    res.json({ ok: true });
  });

  // Remove finished tasks (completed/failed/cancelled) from the queue.
  app.post("/api/queue/clear", (req, res) => {
    const { projectId } = req.body || {};
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const state = queues.get(String(projectId));
    if (state) {
      state.tasks = state.tasks.filter(
        (t) => t.status === "pending" || t.status === "running",
      );
      persist(String(projectId));
    }
    res.json({ ok: true });
  });
}

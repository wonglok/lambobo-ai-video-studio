import { create } from "zustand";
import type {
  AspectRatio,
  Resolution,
  VideoMode,
  ProjectImage,
} from "./generationStore";

const API_BASE = `http://localhost:${(window as any).PORT}`;

export type BatchRowStatus =
  | "idle"
  | "uploading"
  | "generating"
  | "done"
  | "error";

export interface BatchVideoRow {
  id: string;
  prompt: string;
  imagePath: string | null;
  imageUrl: string | null;
  imageFilename: string | null;
  status: BatchRowStatus;
  result: string | null;
  error: string | null;
  logs: string[];
}

interface BatchVideoStore {
  // Rows
  rows: BatchVideoRow[];

  // Shared generation settings
  duration: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  mode: VideoMode;

  // Batch generation state
  running: boolean;
  progress: { current: number; total: number } | null;
  cancelRequested: boolean;
  logs: string[];

  addRow: () => void;
  removeRow: (id: string) => void;
  updatePrompt: (id: string, prompt: string) => void;
  clearRowResult: (id: string) => void;
  uploadRowImage: (
    id: string,
    base64: string,
    filename: string | undefined,
    projectId: string,
  ) => Promise<string | null>;
  setRowImage: (id: string, image: ProjectImage) => void;

  setDuration: (v: number) => void;
  setAspectRatio: (v: AspectRatio) => void;
  setResolution: (v: Resolution) => void;
  setMode: (v: VideoMode) => void;

  generateRows: (projectId: string, ids: string[]) => Promise<void>;
  generateRow: (projectId: string, id: string) => Promise<void>;
  generateAll: (projectId: string) => Promise<void>;
  cancel: () => void;

  reset: () => void;
}

let batchAbortController: AbortController | null = null;

function getDimensions(
  aspect: AspectRatio,
  resolution: Resolution,
): { width: number; height: number } {
  const size = parseInt(resolution);
  switch (aspect) {
    case "1:1":
      return { width: size, height: size };
    case "16:9":
      return { width: Math.round((size * 16) / 9), height: size };
    case "9:16":
      return { width: size, height: Math.round((size * 16) / 9) };
    case "4:3":
      return { width: Math.round((size * 4) / 3), height: size };
    case "3:4":
      return { width: size, height: Math.round((size * 4) / 3) };
  }
}

// The image-to-video backend only accepts a bare filename, so normalise any
// uploaded path / file URL / api-files URL down to just the basename.
function normalizeImagePath(path: string): string {
  let p = path;
  if (p.includes("/api/files?path=")) {
    try {
      const url = new URL(p);
      p = url.searchParams.get("path") || p;
    } catch {
      // not a valid URL, use as-is
    }
  }
  if (p.startsWith("file://")) {
    p = p.slice(7);
  }
  return p.split("/").pop() || p;
}

async function readSSEStream(
  response: Response,
  onEvent: (event: string, data: any) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let eventType = "message";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          try {
            onEvent(eventType, JSON.parse(line.slice(6)));
          } catch {
            // skip malformed lines
          }
          eventType = "message";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function playBeep() {
  try {
    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // silently ignore if audio not available
  }
}

function makeRow(): BatchVideoRow {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    prompt: "",
    imagePath: null,
    imageUrl: null,
    imageFilename: null,
    status: "idle",
    result: null,
    error: null,
    logs: [],
  };
}

export const useBatchVideoStore = create<BatchVideoStore>((set, get) => ({
  rows: [makeRow()],

  duration: 5,
  aspectRatio: "1:1",
  resolution: "480p",
  mode: "distilled",

  running: false,
  progress: null,
  cancelRequested: false,
  logs: [],

  addRow: () => set((s) => ({ rows: [...s.rows, makeRow()] })),

  removeRow: (id) =>
    set((s) => ({ rows: s.rows.filter((r) => r.id !== id) })),

  updatePrompt: (id, prompt) =>
    set((s) => ({
      rows: s.rows.map((r) => (r.id === id ? { ...r, prompt } : r)),
    })),

  clearRowResult: (id) =>
    set((s) => ({
      rows: s.rows.map((r) =>
        r.id === id ? { ...r, result: null, error: null, status: "idle" } : r,
      ),
    })),

  uploadRowImage: async (id, base64, filename, projectId) => {
    set((s) => ({
      rows: s.rows.map((r) =>
        r.id === id ? { ...r, status: "uploading" } : r,
      ),
    }));

    try {
      const res = await fetch(`${API_BASE}/api/upload/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64,
          filename: filename || `upload-${Date.now()}.png`,
          projectId,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          rows: s.rows.map((r) =>
            r.id === id ? { ...r, status: "error", error: err } : r,
          ),
        }));
        return null;
      }

      const data = await res.json();
      const url = `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`;
      set((s) => ({
        rows: s.rows.map((r) =>
          r.id === id
            ? {
                ...r,
                status: "idle",
                imagePath: data.path,
                imageUrl: url,
                imageFilename: data.filename,
              }
            : r,
        ),
      }));
      return data.path as string;
    } catch (e) {
      set((s) => ({
        rows: s.rows.map((r) =>
          r.id === id ? { ...r, status: "error", error: String(e) } : r,
        ),
      }));
      return null;
    }
  },

  setRowImage: (id, image) =>
    set((s) => ({
      rows: s.rows.map((r) =>
        r.id === id
          ? {
              ...r,
              imagePath: image.url,
              imageUrl: image.url,
              imageFilename: image.filename,
              status: "idle",
              error: null,
            }
          : r,
      ),
    })),

  setDuration: (duration) => set({ duration }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setResolution: (resolution) => set({ resolution }),
  setMode: (mode) => set({ mode }),

  generateRows: async (projectId, ids) => {
    if (get().running) return;

    const rows = get().rows;
    const targets = ids
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is BatchVideoRow => !!r)
      .filter((r) => r.prompt.trim() && r.imagePath);

    if (targets.length === 0) return;

    const { duration, aspectRatio, resolution, mode } = get();
    const { width, height } = getDimensions(aspectRatio, resolution);

    batchAbortController = new AbortController();
    const signal = batchAbortController.signal;

    set({
      running: true,
      progress: { current: 0, total: targets.length },
      cancelRequested: false,
      logs: [],
    });

    let cancelled = false;

    for (let i = 0; i < targets.length; i++) {
      if (get().cancelRequested) {
        cancelled = true;
        break;
      }

      const row = targets[i];
      const imagePath = normalizeImagePath(row.imagePath!);

      set((s) => ({
        progress: { current: i + 1, total: targets.length },
        rows: s.rows.map((r) =>
          r.id === row.id
            ? { ...r, status: "generating", error: null, logs: [] }
            : r,
        ),
        logs: [
          ...s.logs,
          `[${i + 1}/${targets.length}] Generating: ${row.prompt.trim().slice(0, 80)}`,
        ],
      }));

      try {
        const res = await fetch(`${API_BASE}/api/render/image-to-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: row.prompt.trim(),
            imagePath,
            projectId,
            width,
            height,
            frames: duration * 24 + 1,
            frameRate: 24,
            mode,
          }),
          signal,
        });

        if (!res.ok) {
          const err = await res.text();
          set((s) => ({
            rows: s.rows.map((r) =>
              r.id === row.id ? { ...r, status: "error", error: err } : r,
            ),
          }));
          continue;
        }

        await readSSEStream(res, (event, data) => {
          switch (event) {
            case "log":
              set((s) => ({
                rows: s.rows.map((r) =>
                  r.id === row.id
                    ? { ...r, logs: [...r.logs, data.text as string] }
                    : r,
                ),
                logs: [...s.logs, data.text as string],
              }));
              break;
            case "complete":
              set((s) => ({
                rows: s.rows.map((r) =>
                  r.id === row.id
                    ? {
                        ...r,
                        status: "done",
                        result: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
                      }
                    : r,
                ),
              }));
              break;
            case "error":
              set((s) => ({
                rows: s.rows.map((r) =>
                  r.id === row.id
                    ? {
                        ...r,
                        status: "error",
                        error: data.error || "Video generation failed",
                      }
                    : r,
                ),
              }));
              break;
          }
        });
      } catch (e: any) {
        if (e?.name === "AbortError") {
          cancelled = true;
          break;
        }
        set((s) => ({
          rows: s.rows.map((r) =>
            r.id === row.id
              ? { ...r, status: "error", error: String(e) }
              : r,
          ),
        }));
      }
    }

    batchAbortController = null;
    set({ running: false, progress: null, cancelRequested: false });

    if (!cancelled) {
      playBeep();
    }
  },

  generateRow: (projectId, id) => get().generateRows(projectId, [id]),

  generateAll: (projectId) => {
    const ids = get()
      .rows.filter((r) => r.prompt.trim() && r.imagePath)
      .map((r) => r.id);
    return get().generateRows(projectId, ids);
  },

  cancel: () => {
    set({ cancelRequested: true });
    if (batchAbortController) {
      batchAbortController.abort();
    }
    set({
      running: false,
      progress: null,
      cancelRequested: false,
      rows: get().rows.map((r) =>
        r.status === "generating" ? { ...r, status: "idle" } : r,
      ),
    });
    fetch(`${API_BASE}/api/render/cancel`, { method: "POST" }).catch(() => {});
  },

  reset: () =>
    set({
      rows: [makeRow()],
      duration: 5,
      aspectRatio: "1:1",
      resolution: "480p",
      mode: "distilled",
      running: false,
      progress: null,
      cancelRequested: false,
      logs: [],
    }),
}));

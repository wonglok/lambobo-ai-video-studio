import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  realpathSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import { type Application } from "express";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { spawn, type Subprocess } from "bun";

// Track the currently active spawn process so it can be cancelled
let activeProc: Subprocess | null = null;

// Track the long-running mlx-vlm server process (separate from render jobs).
let agentServerProc: Subprocess | null = null;
let agentStopRequested = false;
let agentServerPort: number | null = null;

/** Port the app started the mlx-vlm server on (null when the server is not running). */
export function getAgentServerPort(): number | null {
  return agentServerPort;
}

const APP_DATA_DIR = join(homedir(), "media-studio");
const OUTPUT_DIR = join(APP_DATA_DIR, "output");
const UPLOAD_DIR = join(APP_DATA_DIR, "upload");
const AGENT_UPLOAD_DIR = join(APP_DATA_DIR, "agent-upload");
const EXTRACTED_FRAMES_DIR = join(APP_DATA_DIR, "extracted-frames");
const CHARACTER_SHEET_DIR = join(APP_DATA_DIR, "character-sheet");
const AGENTS_DIR = join(APP_DATA_DIR, "agents");
const JSON_DIR = join(APP_DATA_DIR, "json");
const PYTHON_DIR = join(APP_DATA_DIR, "python-src");
const TEMP_DIR = join(APP_DATA_DIR, "temp");
const PROJECTS_FILE = join(JSON_DIR, "projects.json");
const CHARACTERS_FILE = join(JSON_DIR, "characters.json");

const MLXGEN_MODEL = "AbstractFramework/qwen-image-edit-2511-4bit";
const Z_IMAGE_MODEL = "AbstractFramework/z-image-turbo-4bit";
const MLX_VLM_MODEL = "mlx-community/gemma-4-e2b-it-4bit";
const H3_MODEL = "appautomaton/minimax-h3-base-8bit-mlx";

const VIDEO_STAGE_FLAGS: Record<string, string> = {
  distilled: "--distilled",
  "one-stage": "--one-stage",
  "two-stage": "--two-stage",
};

const TTS_MODELS: Record<string, string> = {
  low: "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
  high: "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
};

/** Resolve the CLI stage flag for a video generation mode (defaults to distilled). */
function stageFlagFor(mode: unknown): string {
  return typeof mode === "string"
    ? (VIDEO_STAGE_FLAGS[mode] ?? "--distilled")
    : "--distilled";
}

// ========== Project Types ==========

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  filename: string;
  source: "upload" | "generated";
  createdAt: string;
}

// ========== Project Helpers ==========

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

const PROJECT_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function isValidProjectId(id: string): boolean {
  return PROJECT_ID_RE.test(id);
}

/**
 * Resolve an output directory for generated media. Returns the directory path,
 * or null when the project id or supplied directory is invalid / outside the
 * allowed roots.
 */
function resolveOutputDir(
  outputDir: unknown,
  projectId: string,
): string | null {
  if (!isValidProjectId(projectId)) return null;

  const base =
    typeof outputDir === "string" && outputDir.trim()
      ? outputDir.trim()
      : join(OUTPUT_DIR, projectId);

  // Defense in depth: reject null bytes and `..` traversal segments.
  if (base.includes("\0") || base.split(/[/\\]/).includes("..")) return null;

  ensureDir(base);
  let realBase: string;
  try {
    realBase = realpathSync(base);
  } catch {
    return null;
  }

  for (const root of [OUTPUT_DIR, UPLOAD_DIR, AGENTS_DIR]) {
    ensureDir(root);
    const realRoot = realpathSync(root);
    if (realBase === realRoot || realBase.startsWith(realRoot + sep)) {
      return base;
    }
  }
  return null;
}

function readProjects(): Project[] {
  ensureDir(JSON_DIR);
  if (!existsSync(PROJECTS_FILE)) {
    writeFileSync(PROJECTS_FILE, "[]", "utf-8");
    return [];
  }
  try {
    const raw = readFileSync(PROJECTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeProjects(projects: Project[]) {
  ensureDir(JSON_DIR);
  writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), "utf-8");
}

function readCharacters(): Character[] {
  ensureDir(JSON_DIR);
  if (!existsSync(CHARACTERS_FILE)) {
    writeFileSync(CHARACTERS_FILE, "[]", "utf-8");
    return [];
  }
  try {
    return JSON.parse(readFileSync(CHARACTERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeCharacters(characters: Character[]) {
  ensureDir(JSON_DIR);
  writeFileSync(CHARACTERS_FILE, JSON.stringify(characters, null, 2), "utf-8");
}

function makeId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function openInFinder(dirPath: string) {
  // Use Bun.spawn instead of execSync — non-blocking and native to Bun
  spawn(["open", dirPath], {
    stdout: "ignore",
    stderr: "ignore",
    onExit: (_proc, exitCode, _signalCode, _error) => {
      if (exitCode !== 0) {
        console.error(
          `openInFinder: "open ${dirPath}" exited with code ${exitCode}`,
        );
      }
    },
  });
}

// ========== SSE Helper ==========

// Allowed directories for file serving and path resolution.
// Lazily resolved on first use because dirs may not exist at import time.
let _allowedRealDirs: string[] | null = null;
function getAllowedRealDirs(): string[] {
  if (_allowedRealDirs) return _allowedRealDirs;
  [OUTPUT_DIR, UPLOAD_DIR, AGENT_UPLOAD_DIR].forEach((d) => ensureDir(d));
  _allowedRealDirs = [
    realpathSync(OUTPUT_DIR) + sep,
    realpathSync(UPLOAD_DIR) + sep,
    realpathSync(AGENT_UPLOAD_DIR) + sep,
  ];
  return _allowedRealDirs;
}

/** Validate that `resolvedPath` is inside an allowed directory. */
function isPathAllowed(resolvedPath: string): boolean {
  return getAllowedRealDirs().some((dir) => resolvedPath.startsWith(dir));
}

/** Resolve and validate a user-supplied filename. Looks in both upload and output dirs. */
function resolveSafePath(candidate: string, projectId: string): string | null {
  // Reject anything that looks like a path — only bare filenames allowed
  const base = candidate.split(/[/\\]/).pop() || candidate;
  if (base !== candidate || base.includes("..") || base.startsWith(".")) {
    return null;
  }

  // Try the agent-upload dir first, then upload and output dirs.
  for (const dir of [AGENT_UPLOAD_DIR, UPLOAD_DIR, OUTPUT_DIR]) {
    const candidatePath = join(dir, projectId, base);
    if (existsSync(candidatePath)) {
      const resolved = realpathSync(candidatePath);
      if (isPathAllowed(resolved)) return resolved;
    }
  }

  // TTS voiceovers are stored under <output>/<projectId>/voices/<id>/. Search
  // each voice folder for the basename so muxing can resolve the audio.
  const voicesRoot = join(OUTPUT_DIR, projectId, "voices");
  let voiceSubdirs: string[] = [];
  try {
    voiceSubdirs = readdirSync(voicesRoot).map((entry) =>
      join(voicesRoot, entry),
    );
  } catch {
    // voices dir does not exist yet — nothing to search
  }
  for (const voiceDir of voiceSubdirs) {
    const candidatePath = join(voiceDir, base);
    if (existsSync(candidatePath)) {
      const resolved = realpathSync(candidatePath);
      if (isPathAllowed(resolved)) return resolved;
    }
  }

  return null;
}

/** Resolve and validate a user-supplied video filename. Only bare .mp4 names in the output dir. */
function resolveSafeVideoPath(
  candidate: string,
  projectId: string,
): string | null {
  const base = candidate.split(/[/\\]/).pop() || candidate;
  if (base !== candidate || base.includes("..") || base.startsWith(".")) {
    return null;
  }
  if (!base.toLowerCase().endsWith(".mp4")) return null;

  const candidatePath = join(OUTPUT_DIR, projectId, base);
  if (!existsSync(candidatePath)) return null;
  const resolved = realpathSync(candidatePath);
  if (isPathAllowed(resolved)) return resolved;
  return null;
}

/**
 * Resolve the `mlxgen` executable installed via `uv tool install --upgrade mlx-gen`.
 * uv tool installs binaries into `~/.local/bin`; fall back to relying on PATH.
 */
async function getMlxgenBin(): Promise<string> {
  const candidates = [
    join(homedir(), ".local", "bin", "mlxgen"),
    "/opt/homebrew/bin/mlxgen",
    "/usr/local/bin/mlxgen",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "mlxgen";
}

/** True when the `mlxgen` executable is installed (known paths or PATH). */
function isMlxgenInstalled(): boolean {
  const candidates = [
    join(homedir(), ".local", "bin", "mlxgen"),
    "/opt/homebrew/bin/mlxgen",
    "/usr/local/bin/mlxgen",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return true;
  }
  // Fall back to PATH lookup (Bun native, synchronous).
  try {
    return Bun.which("mlxgen") !== null;
  } catch {
    return false;
  }
}

/**
 * Resolve the `mlx_vlm.server` executable installed via `uv tool install mlx-vlm`.
 * uv tool installs binaries into `~/.local/bin`; fall back to relying on PATH.
 */
async function getMlxVlmServerBin(): Promise<string> {
  const candidates = [
    join(homedir(), ".local", "bin", "mlx_vlm.server"),
    "/opt/homebrew/bin/mlx_vlm.server",
    "/usr/local/bin/mlx_vlm.server",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "mlx_vlm.server";
}

/** Kill any process listening on the given port (returns the PIDs that were killed). */
async function killProcessOnPort(port: number): Promise<string[]> {
  try {
    const proc = spawn(["lsof", "-ti", `:${port}`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(
      proc.stdout as ReadableStream<Uint8Array>,
    ).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return [];
    const pids = output.trim().split(/\s+/).filter(Boolean);
    for (const pid of pids) {
      spawn(["kill", "-9", pid], { stdout: "ignore", stderr: "ignore" });
    }
    return pids;
  } catch {
    return [];
  }
}

/** True when the `mlx_vlm.server` executable is installed (known paths or PATH). */
function isMlxVlmInstalled(): boolean {
  const candidates = [
    join(homedir(), ".local", "bin", "mlx_vlm.server"),
    "/opt/homebrew/bin/mlx_vlm.server",
    "/usr/local/bin/mlx_vlm.server",
  ];
  for (const p of candidates) {
    if (existsSync(p)) return true;
  }
  try {
    return Bun.which("mlx_vlm.server") !== null;
  } catch {
    return false;
  }
}

/**
 * Resolve the ffmpeg binary installed via Homebrew (Apple Silicon then Intel).
 * Falls back to relying on PATH when neither known location exists.
 */
async function getFfmpegBin(): Promise<string> {
  const candidates = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "ffmpeg";
}

/**
 * Resolve the TTS output clip for a voice folder. mlx_audio.tts.generate always
 * writes its single generated clip as `audio_000.mp3` directly into `--output`,
 * so the path is deterministic and there is no need to scan for a newest file.
 */
function resolveAudioFile(root: string): string | null {
  const path = join(root, "audio_000.mp3");
  return existsSync(path) ? path : null;
}

/** Directory where Hugging Face Hub caches downloaded models. */
function huggingfaceCacheDir(): string {
  if (process.env.HF_HUB_CACHE) return process.env.HF_HUB_CACHE;
  if (process.env.HF_HOME) return join(process.env.HF_HOME, "hub");
  return join(homedir(), ".cache", "huggingface", "hub");
}

/** True when the given MLX-Gen model has already been downloaded to the HF cache. */
function isModelDownloaded(model: string = MLXGEN_MODEL): boolean {
  const modelDirName = `models--${model.replace("/", "--")}`;
  const snapshotsDir = join(huggingfaceCacheDir(), modelDirName, "snapshots");
  if (!existsSync(snapshotsDir)) return false;
  try {
    return readdirSync(snapshotsDir).some((name) => {
      try {
        return statSync(join(snapshotsDir, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/** Directory the H3 model weights are downloaded into (mlx-h3/weights). */
function h3WeightsDir(): string {
  return join(PYTHON_DIR, "mlx-h3", "weights");
}

/** True when the H3 model has been downloaded into <mlx-h3>/weights. */
function isH3ModelDownloaded(): boolean {
  const dir = h3WeightsDir();
  if (!existsSync(dir)) return false;
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

/**
 * Strip ANSI escape sequences (colors, cursor control, etc.) from a string.
 * Tools like `uv` emit these when streaming to a TTY; forwarding them to the
 * browser renders them as raw control glyphs (e.g. `␛[2m`) instead of text.
 */
function stripAnsi(input: string): string {
  // Matches CSI (`ESC [ ...`) and other two-byte control sequences (`ESC @`–`ESC _`).
  // eslint-disable-next-line no-control-regex
  return input.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

/** Stream stdout/stderr from a Bun subprocess to an SSE response. */
async function streamToSSE(
  readable: ReadableStream<Uint8Array> | undefined,
  prefix: string,
  send: (event: string, data: object) => void,
): Promise<string> {
  let text = "";
  const reader = readable?.getReader();
  if (!reader) return text;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // Use { stream: true } so multi-byte UTF-8 characters split across
      // chunks are reassembled correctly instead of producing mojibake.
      const chunk = stripAnsi(decoder.decode(value, { stream: true }));
      if (chunk) {
        console.log(`[${prefix}]`, chunk);
        text += chunk;
        send("log", { text: chunk });
      }
    }
    // Flush any remaining bytes buffered in the decoder.
    const final = stripAnsi(decoder.decode());
    if (final) {
      console.log(`[${prefix}]`, final);
      text += final;
      send("log", { text: final });
    }
  } finally {
    reader.releaseLock();
  }
  return text;
}

// ========== Routes ==========

export async function renderMediaRoutes({
  app,
  getUvPath,
}: {
  app: Application;
  getUvPath: () => Promise<string>;
}) {
  // ========== Upload ==========

  // Serve generated files so the browser can display them
  app.get("/api/files", async (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // Resolve and verify the path is within allowed directories
    let resolved: string;
    try {
      resolved = realpathSync(filePath);
    } catch {
      res.status(404).json({ error: "File not found" });
      return;
    }

    if (!isPathAllowed(resolved)) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    try {
      const file = Bun.file(resolved);
      const arrayBuffer = await file.arrayBuffer();
      res.setHeader("Content-Type", file.type || "application/octet-stream");
      res.setHeader("Content-Length", String(file.size));
      res.setHeader("Cache-Control", "no-cache");
      res.end(Buffer.from(arrayBuffer));
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to read file", details: String(e) });
    }
  });

  app.post("/api/upload/image", async (req, res) => {
    const { image, filename, projectId } = req.body || {};

    if (!image) {
      res.status(400).json({ error: "Image data is required (base64)" });
      return;
    }
    if (!projectId) {
      res.status(400).json({ error: "Project ID is required" });
      return;
    }

    try {
      // Decode base64 (strip data URL prefix if present)
      const base64 = image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");

      const projectUploadDir = join(UPLOAD_DIR, projectId);
      ensureDir(projectUploadDir);

      const safeName = (filename || `upload-${Date.now()}.png`).replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      const filePath = join(projectUploadDir, safeName);

      writeFileSync(filePath, buffer);

      res.json({
        success: true,
        path: filePath,
        filename: safeName,
        size: buffer.length,
      });
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to save image", details: String(e) });
    }
  });

  app.post("/api/upload/video", async (req, res) => {
    const { video, filename, projectId } = req.body || {};

    if (!video) {
      res.status(400).json({ error: "Video data is required (base64)" });
      return;
    }
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    try {
      // Decode base64 (strip any data URL prefix if present)
      const base64 = String(video).replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");

      const projectUploadDir = join(UPLOAD_DIR, String(projectId));
      ensureDir(projectUploadDir);

      const safeName = (filename || `upload-${Date.now()}.mp4`).replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      const filePath = join(projectUploadDir, safeName);

      writeFileSync(filePath, buffer);

      res.json({
        success: true,
        path: filePath,
        filename: safeName,
        size: buffer.length,
      });
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to save video", details: String(e) });
    }
  });

  app.post("/api/upload/audio", async (req, res) => {
    const { audio, filename, projectId } = req.body || {};

    if (!audio) {
      res.status(400).json({ error: "Audio data is required (base64)" });
      return;
    }
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    try {
      // Decode base64 (strip data URL prefix if present)
      const base64 = String(audio).replace(/^data:audio\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");

      const projectUploadDir = join(UPLOAD_DIR, projectId);
      ensureDir(projectUploadDir);

      const safeName = (filename || `upload-${Date.now()}.mp3`).replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      const filePath = join(projectUploadDir, safeName);

      writeFileSync(filePath, buffer);

      res.json({
        success: true,
        path: filePath,
        filename: safeName,
        size: buffer.length,
      });
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to save audio", details: String(e) });
    }
  });

  // List project images (from uploads and generated outputs)
  app.get("/api/projects/:id/images", (req, res) => {
    const { id } = req.params;
    const imageExts = new Set([
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".gif",
      ".bmp",
    ]);
    const results: {
      filename: string;
      url: string;
      source: "upload" | "generated";
    }[] = [];

    for (const [source, dir] of [
      ["upload", UPLOAD_DIR],
      ["generated", OUTPUT_DIR],
    ] as const) {
      const projectDir = join(dir, id);
      if (!existsSync(projectDir)) continue;

      let entries: string[];
      try {
        entries = readdirSync(projectDir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        const ext = entry.slice(entry.lastIndexOf(".")).toLowerCase();
        if (!imageExts.has(ext)) continue;

        const fullPath = join(projectDir, entry);
        try {
          if (!statSync(fullPath).isFile()) continue;
        } catch {
          continue;
        }

        results.push({
          filename: entry,
          url: `/api/files?path=${encodeURIComponent(fullPath)}`,
          source,
        });
      }
    }

    // Sort newest first (by filename which often includes timestamp)
    results.sort((a, b) => b.filename.localeCompare(a.filename));
    res.json(results);
  });

  // List project videos (from generated outputs)
  app.get("/api/projects/:id/videos", (req, res) => {
    const { id } = req.params;
    const videoExts = new Set([".mp4"]);

    const raw: { filename: string; url: string; birthtime: number }[] = [];

    // Videos can live in both the output dir (generated) and the upload dir.
    for (const dir of [OUTPUT_DIR, UPLOAD_DIR]) {
      const projectDir = join(dir, id);
      if (!existsSync(projectDir)) continue;

      let entries: string[];
      try {
        entries = readdirSync(projectDir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        const ext = entry.slice(entry.lastIndexOf(".")).toLowerCase();
        if (!videoExts.has(ext)) continue;

        const fullPath = join(projectDir, entry);
        let stats;
        try {
          stats = statSync(fullPath);
          if (!stats.isFile()) continue;
        } catch {
          continue;
        }

        raw.push({
          filename: entry,
          url: `/api/files?path=${encodeURIComponent(fullPath)}`,
          birthtime: stats.birthtimeMs,
        });
      }
    }

    // Sort newest first by file creation date
    raw.sort((a, b) => b.birthtime - a.birthtime);
    const results = raw.map(({ filename, url }) => ({ filename, url }));
    res.json(results);
  });

  // ========== Render: Text-to-Image ==========

  app.post("/api/render/text-to-image", async (req, res) => {
    const {
      prompt,
      projectId,
      aspect = "1:1",
      width = 512,
      height = 512,
      device = "mps",
    } = req.body || {};

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (!projectId) {
      res.status(400).json({ error: "Project ID is required" });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const zImageFolder = join(PYTHON_DIR, "z-image-mps");
      if (!existsSync(zImageFolder)) {
        send("error", { error: "z-image-mps not found. Run setup first." });
        res.end();
        return;
      }

      const uvPath = await getUvPath();
      const projectOutputDir = join(OUTPUT_DIR, projectId);
      ensureDir(projectOutputDir);

      const outputFile = `img-${Date.now()}.png`;
      const outputPath = join(projectOutputDir, outputFile);

      send("progress", {
        status: "starting",
        label: "Generating image...",
        outputFile,
      });

      const proc = spawn(
        [
          uvPath,
          "run",
          "z-image-mps.py",
          "-p",
          prompt,
          "--aspect",
          String(aspect),
          "--height",
          String(height),
          "--width",
          String(width),
          "--output",
          outputPath,
          "--device",
          device,
        ],
        {
          cwd: zImageFolder,
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      activeProc = proc;

      // Stream stdout/stderr concurrently
      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Image",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Image",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      const success = exitCode === 0 && existsSync(outputPath);

      if (success) {
        send("complete", {
          success: true,
          path: outputPath,
          filename: outputFile,
        });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== Render: Image-to-Video ==========

  app.post("/api/render/image-to-video", async (req, res) => {
    const {
      prompt,
      imagePath,
      projectId,
      outputDir,
      width = 480,
      height = 480,
      frames = 121,
      frameRate = 24,
      mode = "distilled",
    } = req.body || {};

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (!imagePath) {
      res.status(400).json({ error: "Image path is required" });
      return;
    }
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (
      typeof mode !== "string" ||
      !Object.keys(VIDEO_STAGE_FLAGS).includes(mode)
    ) {
      res.status(400).json({ error: "Invalid mode" });
      return;
    }

    // Resolve image path — only allow project-relative paths (no absolute paths)
    const resolvedImage = resolveSafePath(imagePath, projectId);
    if (!resolvedImage) {
      res.status(400).json({
        error:
          "Invalid image path. Provide a filename previously uploaded to this project.",
      });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const ltxFolder = join(PYTHON_DIR, "ltx-2-mlx");
      if (!existsSync(ltxFolder)) {
        send("error", { error: "ltx-2-mlx not found. Run setup first." });
        res.end();
        return;
      }

      const uvPath = await getUvPath();
      const projectOutputDir = resolveOutputDir(outputDir, projectId);
      if (!projectOutputDir) {
        send("error", { error: "Invalid output directory." });
        res.end();
        return;
      }

      const outputFile = `video-${Date.now()}.mp4`;
      const outputPath = join(projectOutputDir, outputFile);

      const videoWidth = Number(width) || 480;
      const videoHeight = Number(height) || 480;
      const videoFrames = Number(frames) || 121;
      const videoFps = Number(frameRate) || 24;

      send("progress", {
        status: "starting",
        label: "Generating video...",
        outputFile,
        settings: {
          width: videoWidth,
          height: videoHeight,
          frames: videoFrames,
          fps: videoFps,
        },
      });

      const proc = spawn(
        [
          uvPath,
          "run",
          "ltx-2-mlx",
          "generate",
          "--model",
          "dgrauet/ltx-2.3-mlx-q4",
          "--prompt",
          prompt,
          stageFlagFor(mode),
          // "--low-ram",
          "--frames",
          String(videoFrames),
          "--width",
          String(videoWidth),
          "--height",
          String(videoHeight),
          "--frame-rate",
          String(videoFps),
          "--image",
          resolvedImage,
          "--output",
          outputPath,
        ],
        {
          env: process.env,
          cwd: ltxFolder,
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      activeProc = proc;

      // Stream stdout/stderr concurrently
      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Video",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Video",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      const success = exitCode === 0 && existsSync(outputPath);

      if (success) {
        send("complete", {
          success: true,
          path: outputPath,
          filename: outputFile,
        });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== Render: Text-to-Video ==========

  app.post("/api/render/text-to-video", async (req, res) => {
    const {
      prompt,
      projectId,
      outputDir,
      width = 480,
      height = 480,
      frames = 121,
      frameRate = 24,
      mode = "distilled",
    } = req.body || {};

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (
      typeof mode !== "string" ||
      !Object.keys(VIDEO_STAGE_FLAGS).includes(mode)
    ) {
      res.status(400).json({ error: "Invalid mode" });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const ltxFolder = join(PYTHON_DIR, "ltx-2-mlx");
      if (!existsSync(ltxFolder)) {
        send("error", { error: "ltx-2-mlx not found. Run setup first." });
        res.end();
        return;
      }

      const uvPath = await getUvPath();
      const projectOutputDir = resolveOutputDir(outputDir, projectId);
      if (!projectOutputDir) {
        send("error", { error: "Invalid output directory." });
        res.end();
        return;
      }

      const outputFile = `video-${Date.now()}.mp4`;
      const outputPath = join(projectOutputDir, outputFile);

      const videoWidth = Number(width) || 480;
      const videoHeight = Number(height) || 480;
      const videoFrames = Number(frames) || 121;
      const videoFps = Number(frameRate) || 24;

      send("progress", {
        status: "starting",
        label: "Generating video...",
        outputFile,
        settings: {
          width: videoWidth,
          height: videoHeight,
          frames: videoFrames,
          fps: videoFps,
        },
      });

      const proc = spawn(
        [
          uvPath,
          "run",
          "ltx-2-mlx",
          "generate",
          "--model",
          "dgrauet/ltx-2.3-mlx-q4",
          "--prompt",
          prompt,
          stageFlagFor(mode),
          // "--low-ram",
          "--frames",
          String(videoFrames),
          "--width",
          String(videoWidth),
          "--height",
          String(videoHeight),
          "--frame-rate",
          String(videoFps),
          "--output",
          outputPath,
        ],
        {
          env: process.env,
          cwd: ltxFolder,
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "TextVideo",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "TextVideo",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      const success = exitCode === 0 && existsSync(outputPath);

      if (success) {
        send("complete", {
          success: true,
          path: outputPath,
          filename: outputFile,
        });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== Render: Extend-Video ==========

  app.post("/api/render/extend-video", async (req, res) => {
    const { prompt, videoPath, projectId, extendFrames = 2 } = req.body || {};

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (!videoPath) {
      res.status(400).json({ error: "Video path is required" });
      return;
    }
    if (!projectId) {
      res.status(400).json({ error: "Project ID is required" });
      return;
    }

    // Resolve video path — only bare .mp4 filenames in this project's output dir
    const resolvedVideo = resolveSafeVideoPath(videoPath, projectId);
    if (!resolvedVideo) {
      res.status(400).json({
        error:
          "Invalid video path. Provide a filename previously generated in this project.",
      });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const ltxFolder = join(PYTHON_DIR, "ltx-2-mlx");
      if (!existsSync(ltxFolder)) {
        send("error", { error: "ltx-2-mlx not found. Run setup first." });
        res.end();
        return;
      }

      const uvPath = await getUvPath();
      const projectOutputDir = join(OUTPUT_DIR, projectId);
      ensureDir(projectOutputDir);

      const outputFile = `extended-${Date.now()}.mp4`;
      const outputPath = join(projectOutputDir, outputFile);

      const framesToAdd = Number(extendFrames) || 2;

      send("progress", {
        status: "starting",
        label: "Extending video...",
        inputFile: resolvedVideo,
        outputFile,
        settings: { extendFrames: framesToAdd },
      });

      const proc = spawn(
        [
          uvPath,
          "run",
          "ltx-2-mlx",
          "extend",
          "--model",
          "dgrauet/ltx-2.3-mlx-q4",
          "--prompt",
          prompt,
          "--video",
          resolvedVideo,
          "--extend-frames",
          String(framesToAdd),
          "--output",
          outputPath,
        ],
        {
          env: process.env,
          cwd: ltxFolder,
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      activeProc = proc;

      // Stream stdout/stderr concurrently
      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Extend",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Extend",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      const success = exitCode === 0 && existsSync(outputPath);

      if (success) {
        send("complete", {
          success: true,
          path: outputPath,
          filename: outputFile,
        });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== MLX-Audio: Status ==========

  app.get("/api/mlxaudio/status", async (_req, res) => {
    // Never throw on a missing uv — installation state is based on the folder.
    try {
      await getUvPath();
    } catch {
      // uv not found; installed is still reported from the folder below.
    }
    res.json({
      installed: existsSync(join(PYTHON_DIR, "mlx-audio")),
    });
  });

  // ========== Render: Text-to-Speech (mlx-audio) ==========

  app.post("/api/render/tts", async (req, res) => {
    const { text, refAudioPath, projectId, outputDir, quality, voiceId } =
      req.body || {};

    if (!text || typeof text !== "string" || !text.trim()) {
      res.status(400).json({ error: "Text is required" });
      return;
    }
    if (!refAudioPath) {
      res.status(400).json({ error: "Reference audio is required" });
      return;
    }
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (quality !== "low" && quality !== "high") {
      res.status(400).json({ error: "Quality must be 'low' or 'high'" });
      return;
    }

    // Resolve reference audio — only bare filenames in this project's dirs
    const resolvedRef = resolveSafePath(refAudioPath, projectId);
    if (!resolvedRef) {
      res.status(400).json({
        error:
          "Invalid reference audio path. Provide a filename previously uploaded to this project.",
      });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const uvPath = await getUvPath();
      const projectOutputDir = resolveOutputDir(outputDir, projectId);
      if (!projectOutputDir) {
        send("error", { error: "Invalid output directory." });
        res.end();
        return;
      }

      // TTS audio is saved under <projectOutputDir>/voices/<voiceId>/ so each
      // row's voiceover stays isolated in its own folder. Sanitize voiceId to
      // alphanumerics/_/- so it can never escape the voices directory.
      const safeVoiceId = String(voiceId ?? `voice-${Date.now()}`)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 64);
      const voiceDir = join(projectOutputDir, "voices", safeVoiceId);
      ensureDir(voiceDir);

      send("progress", {
        status: "starting",
        label: "Generating speech...",
        model: TTS_MODELS[quality],
      });

      // No --play flag: this is a silent server-side batch generation. The mp3
      // lands in <projectOutputDir>/voices/<voiceId>/, which is servable via
      // /api/files and resolvable via resolveSafePath for the mux step.
      const proc = spawn(
        [
          uvPath,
          "run",
          "mlx_audio.tts.generate",
          "--model",
          TTS_MODELS[quality],
          "--text",
          text,
          "--ref_audio",
          resolvedRef,
          "--output",
          voiceDir,
          "--audio_format",
          "mp3",
          "--play",
          "--instruct",
          "slow down speech",
        ],
        {
          env: process.env,
          cwd: voiceDir,
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "TTS",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "TTS",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        const path = resolveAudioFile(voiceDir);
        if (path) {
          send("complete", {
            success: true,
            path,
            filename: path.split(sep).pop(),
          });
        } else {
          send("error", {
            error: "TTS completed but no audio file was produced",
          });
        }
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== Render: Mux Video + Audio ==========

  app.post("/api/render/mux-audio", async (req, res) => {
    const { videoPath, audioPath, projectId, outputDir } = req.body || {};

    if (!videoPath) {
      res.status(400).json({ error: "Video path is required" });
      return;
    }
    if (!audioPath) {
      res.status(400).json({ error: "Audio path is required" });
      return;
    }
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    // Resolve video path — only bare .mp4 filenames in this project's output dir
    const resolvedVideo = resolveSafeVideoPath(videoPath, projectId);
    if (!resolvedVideo) {
      res.status(400).json({
        error:
          "Invalid video path. Provide a filename previously generated in this project.",
      });
      return;
    }

    // Resolve audio path — only bare filenames in this project's dirs
    const resolvedAudio = resolveSafePath(audioPath, projectId);
    if (!resolvedAudio) {
      res.status(400).json({
        error:
          "Invalid audio path. Provide a filename previously generated or uploaded to this project.",
      });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const ffmpegBin = await getFfmpegBin();
      const projectOutputDir = resolveOutputDir(outputDir, projectId);
      if (!projectOutputDir) {
        send("error", { error: "Invalid output directory." });
        res.end();
        return;
      }

      const finalFile = `voice-${Date.now()}.mp4`;
      const finalPath = join(projectOutputDir, finalFile);

      send("progress", {
        status: "starting",
        label: "Muxing video and audio...",
        outputFile: finalFile,
      });

      const proc = spawn(
        [
          ffmpegBin,
          "-y",
          "-i",
          resolvedVideo,
          "-i",
          resolvedAudio,
          "-map",
          "0:v",
          "-map",
          "1:a",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-shortest",
          finalPath,
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Mux",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Mux",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0 && existsSync(finalPath)) {
        send("complete", {
          success: true,
          path: finalPath,
          filename: finalFile,
        });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== MLX-Gen: Status ==========

  app.get("/api/mlxgen/status", (_req, res) => {
    res.json({
      installed: isMlxgenInstalled(),
      modelDownloaded: isModelDownloaded(),
      zModelDownloaded: isModelDownloaded(Z_IMAGE_MODEL),
    });
  });

  // ========== MLX-Gen: Install ==========

  app.post("/api/mlxgen/install", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const uvPath = await getUvPath();
      send("progress", {
        status: "starting",
        label: "Installing mlx-gen...",
      });

      const proc = spawn([uvPath, "tool", "install", "--upgrade", "mlx-gen"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Install",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Install",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== MLX-Gen: Download Model ==========

  app.post("/api/mlxgen/download-model", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const mlxgen = await getMlxgenBin();
      send("progress", {
        status: "starting",
        label: `Downloading model ${MLXGEN_MODEL}...`,
      });

      const proc = spawn([mlxgen, "download", "--model", MLXGEN_MODEL], {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Download",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Download",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== MLX-Gen: Download Z-Image Model ==========

  app.post("/api/mlxgen/download-z-model", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const mlxgen = await getMlxgenBin();
      send("progress", {
        status: "starting",
        label: `Downloading model ${Z_IMAGE_MODEL}...`,
      });

      const proc = spawn([mlxgen, "download", "--model", Z_IMAGE_MODEL], {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Download",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Download",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== H3: Download Model ==========

  app.get("/api/h3/status", (_req, res) => {
    res.json({ downloaded: isH3ModelDownloaded() });
  });

  app.post("/api/h3/download-model", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // The `hf download` command must run from inside the mlx-h3 checkout so
    // its weights land in <mlx-h3>/weights.
    const featureFolder = join(PYTHON_DIR, "mlx-h3");
    if (!existsSync(featureFolder)) {
      mkdirSync(featureFolder, { recursive: true });
    }

    try {
      send("progress", {
        status: "starting",
        label: `Downloading model ${H3_MODEL}...`,
      });

      const proc = spawn(
        ["hf", "download", H3_MODEL, "--local-dir", "weights"],
        {
          cwd: featureFolder,
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "H3 Download",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "H3 Download",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== H3: Generate (References-to-Video) ==========

  app.post("/api/h3/generate", async (req, res) => {
    const {
      prompt,
      refs,
      projectId,
      steps = 20,
      width = 640,
      height = 448,
      frames = 121,
      seed = 42,
    } = req.body || {};

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    // Resolve ordered reference media (images and videos) to safe paths.
    const mediaRefs = Array.isArray(refs)
      ? refs.filter(
          (r): r is { kind: "image" | "video"; filename: string } =>
            !!r &&
            (r.kind === "image" || r.kind === "video") &&
            typeof r.filename === "string" &&
            !!r.filename.trim(),
        )
      : [];
    if (mediaRefs.length === 0) {
      res.status(400).json({
        error:
          "At least one reference image or video is required. Upload or select one first.",
      });
      return;
    }

    const resolvedRefs: { kind: "image" | "video"; path: string }[] = [];
    for (const ref of mediaRefs) {
      const resolved = resolveSafePath(ref.filename.trim(), String(projectId));
      if (!resolved) {
        res.status(400).json({
          error: `Reference ${ref.kind} not found in this project: ${ref.filename}`,
        });
        return;
      }
      resolvedRefs.push({ kind: ref.kind, path: resolved });
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const featureFolder = join(PYTHON_DIR, "mlx-h3");
      if (!existsSync(featureFolder)) {
        send("error", { error: "mlx-h3 not found. Run setup first." });
        res.end();
        return;
      }

      const uvPath = await getUvPath();
      const projectOutputDir = resolveOutputDir(null, String(projectId));
      if (!projectOutputDir) {
        send("error", { error: "Invalid output directory." });
        res.end();
        return;
      }

      const outputFile = `references-${Date.now()}.mp4`;
      const outputPath = join(projectOutputDir, outputFile);

      const stepCount = Number(steps) || 20;
      const videoWidth = Number(width) || 640;
      const videoHeight = Number(height) || 448;
      const frameCount = Number(frames) || 121;
      const seedValue = Number(seed) || 42;

      send("progress", {
        status: "starting",
        label: "Generating references-to-video...",
        outputFile,
        settings: {
          steps: stepCount,
          width: videoWidth,
          height: videoHeight,
          frames: frameCount,
          seed: seedValue,
        },
      });

      const args: string[] = [uvPath, "run", "mlx-h3"];
      for (const ref of resolvedRefs) {
        args.push(
          ref.kind === "image" ? "--ref-image" : "--ref-video",
          ref.path,
        );
      }
      args.push(
        "--steps",
        String(stepCount),
        "--width",
        String(videoWidth),
        "--height",
        String(videoHeight),
        "--frames",
        String(frameCount),
        "--seed",
        String(seedValue),
        "--output",
        outputPath,
        prompt,
      );

      const proc = spawn(args, {
        env: process.env,
        cwd: featureFolder,
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "H3 Generate",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "H3 Generate",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      const success = exitCode === 0 && existsSync(outputPath);

      if (success) {
        send("complete", {
          success: true,
          path: outputPath,
          filename: outputFile,
        });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== MLX-Gen: Generate (Image Edit) ==========

  app.post("/api/mlxgen/generate", async (req, res) => {
    const { prompt, imagePath, image, projectId, width, height } =
      req.body || {};

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (!projectId) {
      res.status(400).json({ error: "Project ID is required" });
      return;
    }

    // Project IDs are generated by makeId() (alphanumeric + hyphen). Reject
    // anything else (including `.`, `..`, and path separators) so a malicious
    // projectId cannot escape OUTPUT_DIR/TEMP_DIR via `../`.
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    // Resolve the character image. Prefer a client-side preprocessed PNG
    // (base64), which is written to the temp workspace; otherwise fall back to
    // a bare filename previously uploaded to this project.
    let resolvedImage: string | null = null;
    let tempImagePath: string | null = null;

    if (image) {
      // Decode base64 (strip data URL prefix if present)
      const base64 = String(image).replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const tempDir = join(TEMP_DIR, String(projectId));
      ensureDir(tempDir);
      tempImagePath = join(tempDir, `temp-${Date.now()}.png`);
      writeFileSync(tempImagePath, buffer);
      resolvedImage = tempImagePath;
    } else if (imagePath) {
      resolvedImage = resolveSafePath(imagePath, projectId);
    }

    if (!resolvedImage) {
      res.status(400).json({
        error:
          "Image is required. Provide a preprocessed image or a filename previously uploaded to this project.",
      });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const mlxgen = await getMlxgenBin();
      const projectOutputDir = join(OUTPUT_DIR, projectId);
      ensureDir(projectOutputDir);

      const outputFile = `mlxgen-${Date.now()}.png`;
      const outputPath = join(projectOutputDir, outputFile);

      send("progress", {
        status: "starting",
        label: "Generating image...",
        outputFile,
      });

      const args: string[] = [
        mlxgen,
        "generate",
        "--model",
        MLXGEN_MODEL,
        "--image",
        resolvedImage,
        "--prompt",
        prompt,
        "--output",
        outputPath,
        "--steps",
        String(40),
      ];

      // Optional output size (kept in the same aspect ratio by the client).
      const outWidth = Number(width);
      const outHeight = Number(height);
      if (
        Number.isInteger(outWidth) &&
        outWidth > 0 &&
        Number.isInteger(outHeight) &&
        outHeight > 0
      ) {
        args.push("--width", String(outWidth), "--height", String(outHeight));
      }

      const proc = spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "MLXGen",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "MLXGen",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      const success = exitCode === 0 && existsSync(outputPath);

      if (success) {
        send("complete", {
          success: true,
          path: outputPath,
          filename: outputFile,
        });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      // Clean up the temporary workspace image now that generation is done.
      if (tempImagePath) {
        try {
          unlinkSync(tempImagePath);
        } catch {
          // already removed
        }
        try {
          // Remove the temp dir only when it is empty (no recursive delete).
          rmSync(join(TEMP_DIR, String(projectId)), { force: true });
        } catch {
          // ignore cleanup failures
        }
      }
      res.end();
    }
  });

  // ========== MLX-Gen: Generate (Text-to-Image) ==========

  app.post("/api/mlxgen/text-to-image", async (req, res) => {
    const { prompt, projectId, width, height, steps } = req.body || {};

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }
    if (!projectId) {
      res.status(400).json({ error: "Project ID is required" });
      return;
    }
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const mlxgen = await getMlxgenBin();
      const projectOutputDir = join(OUTPUT_DIR, projectId);
      ensureDir(projectOutputDir);

      const outputFile = `zimage-${Date.now()}.png`;
      const outputPath = join(projectOutputDir, outputFile);

      send("progress", {
        status: "starting",
        label: "Generating image...",
        outputFile,
      });

      // z-image-turbo is a few-step distillation model; default to 4 steps.
      const resolvedSteps = Number(steps) > 0 ? Number(steps) : 6;

      const args: string[] = [
        mlxgen,
        "generate",
        "--model",
        Z_IMAGE_MODEL,
        "--prompt",
        prompt,
        "--output",
        outputPath,
        "--steps",
        String(resolvedSteps),
      ];

      const outWidth = Number(width);
      const outHeight = Number(height);
      if (
        Number.isInteger(outWidth) &&
        outWidth > 0 &&
        Number.isInteger(outHeight) &&
        outHeight > 0
      ) {
        args.push("--width", String(outWidth), "--height", String(outHeight));
      }

      const proc = spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "MLXGen",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "MLXGen",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      const success = exitCode === 0 && existsSync(outputPath);

      if (success) {
        send("complete", {
          success: true,
          path: outputPath,
          filename: outputFile,
        });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  // ========== Agent (mlx-vlm) ==========

  app.get("/api/agent/status", (_req, res) => {
    res.json({
      installed: isMlxVlmInstalled(),
      serverRunning: agentServerProc !== null,
    });
  });

  app.post("/api/agent/install", async (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const uvPath = await getUvPath();
      send("progress", {
        status: "starting",
        label: "Installing mlx-vlm...",
      });

      const proc = spawn([uvPath, "tool", "install", "mlx-vlm"], {
        stdout: "pipe",
        stderr: "pipe",
      });

      activeProc = proc;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Install mlx-vlm",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Install mlx-vlm",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Process exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      activeProc = null;
      res.end();
    }
  });

  app.post("/api/agent/start", async (req, res) => {
    const { port, model } = req.body || {};
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      res
        .status(400)
        .json({ error: "Port must be an integer between 1 and 65535" });
      return;
    }
    const modelName =
      typeof model === "string" && model.trim() ? model.trim() : MLX_VLM_MODEL;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const bin = await getMlxVlmServerBin();

      const killedPids = await killProcessOnPort(portNum);
      if (killedPids.length > 0) {
        send("log", {
          text: `Freed port ${portNum} (killed PID(s): ${killedPids.join(", ")})\n`,
        });
      }

      send("progress", {
        status: "starting",
        label: `Starting mlx-vlm server (${modelName}) on port ${portNum}...`,
      });

      const args: string[] = [
        bin,
        "--model",
        modelName,
        "--port",
        String(portNum),
      ];

      // const draftModel = DRAFT_MODELS[modelName];
      // if (draftModel) {
      //   args.push(
      //     "--draft-model",
      //     draftModel,
      //     "--draft-kind",
      //     "mtp",
      //     "--draft-block-size",
      //     "4",
      //   );
      // }

      const proc = spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      });

      agentServerProc = proc;
      agentServerPort = portNum;

      const stdoutPromise = streamToSSE(
        proc.stdout as ReadableStream<Uint8Array>,
        "Agent",
        send,
      );
      const stderrText = await streamToSSE(
        proc.stderr as ReadableStream<Uint8Array>,
        "Agent",
        send,
      );
      await stdoutPromise;

      const exitCode = await proc.exited;
      if (agentStopRequested) {
        send("complete", { success: true, stopped: true });
        agentStopRequested = false;
      } else if (exitCode === 0) {
        send("complete", { success: true });
      } else {
        send("error", {
          error: stderrText || `Server exited with code ${exitCode}`,
          exitCode,
        });
      }
    } catch (e) {
      send("error", { error: String(e) });
    } finally {
      agentServerProc = null;
      agentServerPort = null;
      res.end();
    }
  });

  app.post("/api/agent/stop", (_req, res) => {
    agentStopRequested = true;
    if (agentServerProc) {
      try {
        agentServerProc.kill();
      } catch {
        // process may already be dead
      }
    }
    agentServerPort = null;
    res.json({ ok: true });
  });

  app.post("/api/agent/open", (req, res) => {
    const { url } = req.body || {};
    const target = typeof url === "string" ? url.trim() : "";

    // Only open localhost http(s) URLs (avoid opening arbitrary schemes/files).
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(target)) {
      res.status(400).json({ error: "Invalid URL" });
      return;
    }

    spawn(["open", target], {
      stdout: "ignore",
      stderr: "ignore",
      onExit: (_proc, exitCode, _signalCode, _error) => {
        if (exitCode !== 0) {
          console.error(`open: "open ${target}" exited with code ${exitCode}`);
        }
      },
    });
    res.json({ ok: true });
  });

  // List all projects
  app.get("/api/open-output", (_req, res) => {
    try {
      openInFinder(`${OUTPUT_DIR}`);
    } catch {}

    res.json({ ok: true });
  });

  // ========== Render: Cancel ==========

  app.post("/api/render/cancel", (_req, res) => {
    if (activeProc) {
      try {
        activeProc.kill();
      } catch {
        // process may already be dead
      }
      activeProc = null;
    }
    res.json({ ok: true });
  });

  // ========== Project CRUD ==========

  // List all projects
  app.get("/api/projects", (_req, res) => {
    const projects = readProjects();
    res.json(projects);
  });

  // Get single project
  app.get("/api/projects/:id", (req, res) => {
    const projects = readProjects();
    const project = projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project);
  });

  // Create project
  app.post("/api/projects", (req, res) => {
    const { name, description } = req.body || {};
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const projects = readProjects();
    const now = new Date().toISOString();
    const project: Project = {
      id: makeId(),
      name: String(name),
      description: String(description || ""),
      createdAt: now,
      updatedAt: now,
    };

    // Create project folders
    ensureDir(join(UPLOAD_DIR, project.id));
    ensureDir(join(OUTPUT_DIR, project.id));

    projects.push(project);
    writeProjects(projects);

    res.status(201).json(project);
  });

  // Update project
  app.put("/api/projects/:id", (req, res) => {
    const projects = readProjects();
    const index = projects.findIndex((p) => p.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const { name, description } = req.body || {};
    if (name !== undefined) projects[index].name = String(name);
    if (description !== undefined)
      projects[index].description = String(description);
    projects[index].updatedAt = new Date().toISOString();

    writeProjects(projects);
    res.json(projects[index]);
  });

  // Delete project
  app.delete("/api/projects/:id", (req, res) => {
    const projects = readProjects();
    const index = projects.findIndex((p) => p.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const [removed] = projects.splice(index, 1);
    writeProjects(projects);
    res.json(removed);
  });

  // ===== Character CRUD =====

  app.get("/api/characters", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const characters = readCharacters().filter(
      (c) => c.projectId === projectId,
    );
    res.json(characters);
  });

  app.post("/api/characters", (req, res) => {
    const { projectId, name, filename, source } = req.body || {};
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    if (!filename || !String(filename).trim()) {
      res.status(400).json({ error: "Filename is required" });
      return;
    }
    const safeFilename = String(filename).split(/[/\\]/).pop() || "";
    const characters = readCharacters();
    const character: Character = {
      id: makeId(),
      projectId: String(projectId),
      name: String(name ?? "").trim() || safeFilename,
      filename: safeFilename,
      source: source === "generated" ? "generated" : "upload",
      createdAt: new Date().toISOString(),
    };
    characters.push(character);
    writeCharacters(characters);
    res.status(201).json(character);
  });

  app.put("/api/characters/:id", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const characters = readCharacters();
    const index = characters.findIndex(
      (c) => c.id === req.params.id && c.projectId === projectId,
    );
    if (index === -1) {
      res.status(404).json({ error: "Character not found" });
      return;
    }
    const { name, filename, source } = req.body || {};
    if (name !== undefined && String(name).trim()) {
      characters[index].name = String(name).trim();
    }
    if (filename !== undefined && String(filename).trim()) {
      characters[index].filename = String(filename).split(/[/\\]/).pop() || "";
      characters[index].source =
        source === "generated" ? "generated" : "upload";
    }
    writeCharacters(characters);
    res.json(characters[index]);
  });

  app.delete("/api/characters/:id", (req, res) => {
    const projectId = String(req.query.projectId ?? "");
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    const characters = readCharacters();
    const index = characters.findIndex(
      (c) => c.id === req.params.id && c.projectId === projectId,
    );
    if (index === -1) {
      res.status(404).json({ error: "Character not found" });
      return;
    }
    const [removed] = characters.splice(index, 1);
    writeCharacters(characters);
    res.json(removed);
  });

  // Save an extracted video frame into the project's extracted-frames folder.
  app.post("/api/extracted-frames", (req, res) => {
    const { image, filename, projectId } = req.body || {};
    if (!image) {
      res.status(400).json({ error: "Image data is required (base64)" });
      return;
    }
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    try {
      const base64 = String(image).replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const dir = join(EXTRACTED_FRAMES_DIR, String(projectId));
      ensureDir(dir);
      const safeName = (filename || `frame-${Date.now()}.png`).replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );
      writeFileSync(join(dir, safeName), buffer);
      res.json({
        success: true,
        path: join(dir, safeName),
        filename: safeName,
        size: buffer.length,
      });
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to save frame", details: String(e) });
    }
  });

  // Save the character sheet: current.png plus a backup copy under backup/.
  app.post("/api/character-sheet", (req, res) => {
    const { image, projectId } = req.body || {};
    if (!image) {
      res.status(400).json({ error: "Image data is required (base64)" });
      return;
    }
    if (!projectId || !isValidProjectId(String(projectId))) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }
    try {
      const base64 = String(image).replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");

      const projectDir = join(CHARACTER_SHEET_DIR, String(projectId));
      const backupDir = join(projectDir, "backup");
      ensureDir(backupDir);

      const backupId = randomUUID();
      const backupPath = join(backupDir, `${backupId}.png`);
      const currentPath = join(projectDir, "current.png");

      writeFileSync(backupPath, buffer);
      writeFileSync(currentPath, buffer);

      res.json({
        success: true,
        path: currentPath,
        backupPath,
        backupFilename: `${backupId}.png`,
        size: buffer.length,
      });
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to save character sheet", details: String(e) });
    }
  });

  // Open project folder in Finder
  app.post("/api/projects/:id/open-folder", (req, res) => {
    const { type } = req.body || {};
    const projects = readProjects();
    const project = projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    let targetPath: string;
    switch (type) {
      case "upload":
        targetPath = join(UPLOAD_DIR, project.id);
        break;
      case "output":
        targetPath = join(OUTPUT_DIR, project.id);
        break;
      default:
        targetPath = join(OUTPUT_DIR, project.id);
    }

    ensureDir(targetPath);
    try {
      openInFinder(targetPath);
      res.json({ success: true, path: targetPath });
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to open folder", details: String(e) });
    }
  });

  // Open project in Finder (root project folder - opens output dir)
  app.post("/api/projects/:id/open-in-finder", (_req, res) => {
    const projects = readProjects();
    const project = projects.find((p) => p.id === _req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const projectOutputDir = join(OUTPUT_DIR, project.id);
    ensureDir(projectOutputDir);
    try {
      openInFinder(projectOutputDir);
      res.json({ success: true, path: projectOutputDir });
    } catch (e) {
      res
        .status(500)
        .json({ error: "Failed to open in Finder", details: String(e) });
    }
  });
}

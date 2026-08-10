import { create } from "zustand";
import Mustache from "mustache";
import Papa from "papaparse";

const API_BASE = `http://localhost:${(window as any).PORT}`;

// ========== Types ==========

export type GenerationTab = "image" | "video";
export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
export type Resolution = "320p" | "480p" | "640p" | "720p";

function getDimensions(aspect: AspectRatio, resolution: Resolution): {
  width: number;
  height: number;
} {
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

interface ImageState {
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  generating: boolean;
  result: string | null;
  error: string | null;
  logs: string[];
}

interface VideoState {
  prompt: string;
  duration: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  generating: boolean;
  result: string | null;
  error: string | null;
  logs: string[];
}

interface GenerationStore {
  // Tab
  activeTab: GenerationTab;
  setActiveTab: (tab: GenerationTab) => void;

  // Image generation
  image: ImageState;
  setImagePrompt: (v: string) => void;
  setImageAspectRatio: (v: AspectRatio) => void;
  setImageResolution: (v: Resolution) => void;
  clearImageResult: () => void;
  generateImage: (projectId: string) => Promise<void>;

  // Video generation
  video: VideoState;
  setVideoPrompt: (v: string) => void;
  setVideoDuration: (v: number) => void;
  setVideoAspectRatio: (v: AspectRatio) => void;
  setVideoResolution: (v: Resolution) => void;
  clearVideoResult: () => void;
  generateVideo: (projectId: string, imagePath?: string) => Promise<void>;

  // Upload
  uploading: boolean;
  uploadError: string | null;
  uploadedImageUrl: string | null;
  uploadedImageFilename: string | null;
  uploadedImagePath: string | null;
  uploadImage: (
    projectId: string,
    base64: string,
    filename?: string,
  ) => Promise<string | null>;

  // Project images picker
  projectImages: ProjectImage[];
  projectImagesLoading: boolean;
  fetchProjectImages: (projectId: string) => Promise<void>;
  selectedImage: ProjectImage | null;
  selectImage: (img: ProjectImage | null) => void;

  // CSV batch generation
  csvRows: Record<string, string>[];
  csvColumns: string[];
  csvFilename: string | null;
  batchRunning: boolean;
  batchProgress: { current: number; total: number } | null;
  batchCancelRequested: boolean;
  uploadCsv: (base64: string, filename: string) => void;
  clearCsvData: () => void;
  generateBatchVideos: (projectId: string) => Promise<void>;
  cancelBatch: () => void;

  // Reset
  resetAll: () => void;
}

export interface ProjectImage {
  filename: string;
  url: string;
  source: "upload" | "generated";
}

// ========== SSE Stream Reader ==========

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
            const data = JSON.parse(line.slice(6));
            onEvent(eventType, data);
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

// ========== CSV Parser ==========

function parseCsv(text: string): {
  rows: Record<string, string>[];
  columns: string[];
} {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return { rows: result.data, columns: result.meta.fields || [] };
}

// ========== Beep ==========

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

// ========== Initial State ==========

const initialImage: ImageState = {
  prompt: "",
  aspectRatio: "1:1",
  resolution: "480p",
  generating: false,
  result: null,
  error: null,
  logs: [],
};

const initialVideo: VideoState = {
  prompt: `(角色)[{{name}}]: {{script}}`,
  duration: 5,
  aspectRatio: "1:1",
  resolution: "480p",
  generating: false,
  result: null,
  error: null,
  logs: [],
};

// ========== Store ==========

export const useGenerationStore = create<GenerationStore>((set, get) => ({
  activeTab: "video",
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ---- Image ----
  image: { ...initialImage },

  setImagePrompt: (prompt) =>
    set((s) => ({ image: { ...s.image, prompt, error: null } })),
  setImageAspectRatio: (aspectRatio) =>
    set((s) => ({ image: { ...s.image, aspectRatio } })),
  setImageResolution: (resolution) =>
    set((s) => ({ image: { ...s.image, resolution } })),
  clearImageResult: () =>
    set((s) => ({
      image: { ...s.image, result: null, error: null, logs: [] },
    })),

  generateImage: async (projectId) => {
    const { image } = get();
    if (!image.prompt.trim() || image.generating) return;

    const { width, height } = getDimensions(image.aspectRatio, image.resolution);

    set((s) => ({
      image: {
        ...s.image,
        generating: true,
        error: null,
        result: null,
        logs: [],
      },
    }));

    try {
      const res = await fetch(`${API_BASE}/api/render/text-to-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: image.prompt.trim(),
          projectId,
          aspect: image.aspectRatio,
          width,
          height,
          device: "mps",
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          image: { ...s.image, generating: false, error: err },
        }));
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "log":
            set((s) => ({
              image: {
                ...s.image,
                logs: [...s.image.logs, data.text as string],
              },
            }));
            break;
          case "complete":
            set((s) => ({
              image: {
                ...s.image,
                generating: false,
                result: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
              },
            }));
            break;
          case "error":
            set((s) => ({
              image: {
                ...s.image,
                generating: false,
                error: data.error || "Image generation failed",
              },
            }));
            break;
        }
      });
    } catch (e) {
      set((s) => ({
        image: { ...s.image, generating: false, error: String(e) },
      }));
    }
  },

  // ---- Video ----
  video: { ...initialVideo },

  setVideoPrompt: (prompt) =>
    set((s) => ({ video: { ...s.video, prompt, error: null } })),
  setVideoDuration: (duration) =>
    set((s) => ({ video: { ...s.video, duration } })),
  setVideoAspectRatio: (aspectRatio) =>
    set((s) => ({ video: { ...s.video, aspectRatio } })),
  setVideoResolution: (resolution) =>
    set((s) => ({ video: { ...s.video, resolution } })),
  clearVideoResult: () =>
    set((s) => ({
      video: { ...s.video, result: null, error: null, logs: [] },
    })),

  generateVideo: async (projectId, imagePath?) => {
    const { video } = get();
    if (!video.prompt.trim() || video.generating) return;

    const { width, height } = getDimensions(video.aspectRatio, video.resolution);

    // Use the provided imagePath, or fall back to uploaded image, or generated image
    let resolvedImagePath =
      imagePath ||
      get().uploadedImagePath ||
      get().uploadedImageUrl ||
      get().image.result;

    if (!resolvedImagePath) {
      set((s) => ({
        video: {
          ...s.video,
          error: "Image path is required. Upload or generate an image first.",
        },
      }));
      return;
    }

    // Extract raw file path from HTTP URL (e.g. http://localhost:PORT/api/files?path=...)
    if (resolvedImagePath.includes("/api/files?path=")) {
      try {
        const url = new URL(resolvedImagePath);
        resolvedImagePath = url.searchParams.get("path") || resolvedImagePath;
      } catch {
        // not a valid URL, use as-is
      }
    }

    // Strip any remaining file:// prefix
    if (resolvedImagePath.startsWith("file://")) {
      resolvedImagePath = resolvedImagePath.slice(7);
    }

    // The backend now only accepts bare filenames — extract just the basename
    resolvedImagePath = resolvedImagePath.split("/").pop() || resolvedImagePath;

    set((s) => ({
      video: {
        ...s.video,
        generating: true,
        error: null,
        result: null,
        logs: [],
      },
    }));

    try {
      const res = await fetch(`${API_BASE}/api/render/image-to-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: video.prompt.trim(),
          imagePath: resolvedImagePath,
          projectId,
          width,
          height,
          frames: video.duration * 24 + 1,
          frameRate: 24,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        set((s) => ({
          video: { ...s.video, generating: false, error: err },
        }));
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "log":
            set((s) => ({
              video: {
                ...s.video,
                logs: [...s.video.logs, data.text as string],
              },
            }));
            break;
          case "complete":
            set((s) => ({
              video: {
                ...s.video,
                generating: false,
                result: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
              },
            }));
            break;
          case "error":
            set((s) => ({
              video: {
                ...s.video,
                generating: false,
                error: data.error || "Video generation failed",
              },
            }));
            break;
        }
      });
    } catch (e) {
      set((s) => ({
        video: { ...s.video, generating: false, error: String(e) },
      }));
    }
  },

  // ---- Upload ----
  uploading: false,
  uploadError: null,
  uploadedImageUrl: null,
  uploadedImageFilename: null,
  uploadedImagePath: null,

  uploadImage: async (projectId, base64, filename) => {
    set({ uploading: true, uploadError: null });
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
        set({ uploading: false, uploadError: err });
        return null;
      }

      const data = await res.json();
      const url = `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`;
      set({
        uploading: false,
        uploadedImageUrl: url,
        uploadedImageFilename: data.filename,
        uploadedImagePath: data.path,
      });
      return data.path as string;
    } catch (e) {
      set({ uploading: false, uploadError: String(e) });
      return null;
    }
  },

  // ---- Project Images ----
  projectImages: [],
  projectImagesLoading: false,
  selectedImage: null,

  fetchProjectImages: async (projectId) => {
    set({ projectImagesLoading: true });
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/images`);
      if (!res.ok) throw new Error(await res.text());
      const images: ProjectImage[] = await res.json();
      // Resolve relative URLs to absolute so they work regardless of page origin
      const resolved = images.map((img) => ({
        ...img,
        url: img.url.startsWith("http")
          ? img.url
          : `http://localhost:${(window as any).PORT}${img.url}`,
      }));
      set({ projectImages: resolved, projectImagesLoading: false });
    } catch {
      set({ projectImagesLoading: false });
    }
  },

  // ---- CSV Batch ----
  csvRows: [],
  csvColumns: [],
  csvFilename: null,
  batchRunning: false,
  batchProgress: null,
  batchCancelRequested: false,

  uploadCsv: (base64, filename) => {
    try {
      // Decode base64 (strip data URL prefix if present)
      const raw = base64
        .replace(/^data:text\/csv;base64,/, "")
        .replace(/^data:application\/csv;base64,/, "")
        .replace(/^data:text\/plain;base64,/, "");
      // atob() returns a binary string (bytes as Latin-1), which corrupts
      // multi-byte UTF-8 characters (Chinese, emoji, etc.). Decode properly
      // via TextDecoder so CSV names render correctly in Mustache templates.
      const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      const text = new TextDecoder("utf-8").decode(bytes);
      const { rows, columns } = parseCsv(text);
      set({
        csvRows: rows,
        csvColumns: columns,
        csvFilename: filename,
      });
    } catch {
      set({ csvRows: [], csvColumns: [], csvFilename: null });
    }
  },

  clearCsvData: () =>
    set({
      csvRows: [],
      csvColumns: [],
      csvFilename: null,
      batchRunning: false,
      batchProgress: null,
      batchCancelRequested: false,
    }),

  generateBatchVideos: async (projectId) => {
    const { video, csvRows, batchRunning } = get();
    if (batchRunning || csvRows.length === 0) return;

    const { width, height } = getDimensions(video.aspectRatio, video.resolution);

    set({
      batchRunning: true,
      batchProgress: { current: 0, total: csvRows.length },
      batchCancelRequested: false,
    });

    for (let i = 0; i < csvRows.length; i++) {
      if (get().batchCancelRequested) break;

      set({ batchProgress: { current: i + 1, total: csvRows.length } });

      const rowData = csvRows[i];
      const renderedPrompt = Mustache.render(`${video.prompt}`, { ...rowData });

      // Build a name-tagged prompt suffix so the output filename reflects the row
      // const nameTag = rowData.name ? ` [${rowData.name}]` : "";

      // Call the single-video generation with the rendered prompt
      // We use the existing generateVideo logic but inline it here for batch
      let resolvedImagePath =
        get().uploadedImagePath || get().uploadedImageUrl || get().image.result;

      if (!resolvedImagePath) continue;

      if (resolvedImagePath.includes("/api/files?path=")) {
        try {
          const url = new URL(resolvedImagePath);
          resolvedImagePath = url.searchParams.get("path") || resolvedImagePath;
        } catch {
          // not a valid URL, use as-is
        }
      }
      if (resolvedImagePath.startsWith("file://")) {
        resolvedImagePath = resolvedImagePath.slice(7);
      }
      resolvedImagePath =
        resolvedImagePath.split("/").pop() || resolvedImagePath;

      set((s) => ({
        video: {
          ...s.video,
          generating: true,
          error: null,
          result: null,
          logs: [],
        },
      }));

      try {
        const res = await fetch(`${API_BASE}/api/render/image-to-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: `${renderedPrompt}`, //${nameTag}
            imagePath: resolvedImagePath,
            projectId,
            width,
            height,
            frames: video.duration * 24 + 1,
            frameRate: 24,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          set((s) => ({
            video: { ...s.video, generating: false, error: err },
          }));
          continue;
        }

        await readSSEStream(res, (event, data) => {
          switch (event) {
            case "log":
              set((s) => ({
                video: {
                  ...s.video,
                  logs: [
                    ...s.video.logs,
                    `[${i + 1}/${csvRows.length}] ${data.text as string}`,
                  ],
                },
              }));
              break;
            case "complete":
              set((s) => ({
                video: {
                  ...s.video,
                  generating: false,
                  result: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
                },
              }));
              break;
            case "error":
              set((s) => ({
                video: {
                  ...s.video,
                  generating: false,
                  error: data.error || "Video generation failed",
                },
              }));
              break;
          }
        });
      } catch (e) {
        set((s) => ({
          video: { ...s.video, generating: false, error: String(e) },
        }));
      }
    }

    const finished = !get().batchCancelRequested;
    set({
      batchRunning: false,
      batchProgress: null,
      batchCancelRequested: false,
    });

    if (finished) {
      playBeep();
    }
  },

  cancelBatch: () => {
    set({ batchCancelRequested: true });
  },

  selectImage: (img) => {
    if (!img) {
      set({ selectedImage: null });
      return;
    }
    const fullUrl = img.url.startsWith("http")
      ? img.url
      : `http://localhost:${(window as any).PORT}${img.url}`;
    set({
      selectedImage: { ...img, url: fullUrl },
      uploadedImageUrl: fullUrl,
      uploadedImageFilename: img.filename,
    });
  },

  // ---- Reset ----
  resetAll: () =>
    set({
      activeTab: "image",
      image: { ...initialImage },
      video: { ...initialVideo },
      uploading: false,
      uploadError: null,
      uploadedImageUrl: null,
      uploadedImageFilename: null,
      uploadedImagePath: null,
      projectImages: [],
      selectedImage: null,
      csvRows: [],
      csvColumns: [],
      csvFilename: null,
      batchRunning: false,
      batchProgress: null,
      batchCancelRequested: false,
    }),
}));

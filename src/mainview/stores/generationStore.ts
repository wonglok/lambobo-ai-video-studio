import { create } from "zustand";

const API_BASE = `http://localhost:${(window as any).PORT}`;

// ========== Types ==========

export type GenerationTab = "image" | "video";

interface ImageState {
  prompt: string;
  generating: boolean;
  result: string | null;
  error: string | null;
  logs: string[];
}

interface VideoState {
  prompt: string;
  duration: number;
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
  clearImageResult: () => void;
  generateImage: (projectId: string) => Promise<void>;

  // Video generation
  video: VideoState;
  setVideoPrompt: (v: string) => void;
  setVideoDuration: (v: number) => void;
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

// ========== Initial State ==========

const initialImage: ImageState = {
  prompt: "",
  generating: false,
  result: null,
  error: null,
  logs: [],
};

const initialVideo: VideoState = {
  prompt: "",
  duration: 5,
  generating: false,
  result: null,
  error: null,
  logs: [],
};

// ========== Store ==========

export const useGenerationStore = create<GenerationStore>((set, get) => ({
  activeTab: "image",
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ---- Image ----
  image: { ...initialImage },

  setImagePrompt: (prompt) =>
    set((s) => ({ image: { ...s.image, prompt, error: null } })),
  clearImageResult: () =>
    set((s) => ({
      image: { ...s.image, result: null, error: null, logs: [] },
    })),

  generateImage: async (projectId) => {
    const { image } = get();
    if (!image.prompt.trim() || image.generating) return;

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
          aspect: "1:1",
          width: 512,
          height: 512,
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
  clearVideoResult: () =>
    set((s) => ({
      video: { ...s.video, result: null, error: null, logs: [] },
    })),

  generateVideo: async (projectId, imagePath?) => {
    const { video } = get();
    if (!video.prompt.trim() || video.generating) return;

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
          width: 480,
          height: 480,
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
    }),
}));

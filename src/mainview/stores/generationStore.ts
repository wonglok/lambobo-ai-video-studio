import { create } from "zustand";

const API_BASE = `http://localhost:${(window as any).PORT}`;

// ========== Types ==========

export type GenerationTab = "image" | "video";

// ========== kokoro-js Voice List ==========

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  gender: string;
}

export const KOKORO_VOICE_GROUPS: { group: string; voices: VoiceInfo[] }[] = [
  {
    group: "American Female",
    voices: [
      { id: "af_heart", name: "Heart", language: "en-us", gender: "female" },
      { id: "af_alloy", name: "Alloy", language: "en-us", gender: "female" },
      { id: "af_aoede", name: "Aoede", language: "en-us", gender: "female" },
      { id: "af_bella", name: "Bella", language: "en-us", gender: "female" },
      { id: "af_jessica", name: "Jessica", language: "en-us", gender: "female" },
      { id: "af_kore", name: "Kore", language: "en-us", gender: "female" },
      { id: "af_nicole", name: "Nicole", language: "en-us", gender: "female" },
      { id: "af_nova", name: "Nova", language: "en-us", gender: "female" },
      { id: "af_river", name: "River", language: "en-us", gender: "female" },
      { id: "af_sarah", name: "Sarah", language: "en-us", gender: "female" },
      { id: "af_sky", name: "Sky", language: "en-us", gender: "female" },
    ],
  },
  {
    group: "American Male",
    voices: [
      { id: "am_adam", name: "Adam", language: "en-us", gender: "male" },
      { id: "am_echo", name: "Echo", language: "en-us", gender: "male" },
      { id: "am_eric", name: "Eric", language: "en-us", gender: "male" },
      { id: "am_fenrir", name: "Fenrir", language: "en-us", gender: "male" },
      { id: "am_liam", name: "Liam", language: "en-us", gender: "male" },
      { id: "am_michael", name: "Michael", language: "en-us", gender: "male" },
      { id: "am_onyx", name: "Onyx", language: "en-us", gender: "male" },
      { id: "am_puck", name: "Puck", language: "en-us", gender: "male" },
      { id: "am_santa", name: "Santa", language: "en-us", gender: "male" },
    ],
  },
  {
    group: "British Female",
    voices: [
      { id: "bf_alice", name: "Alice", language: "en-gb", gender: "female" },
      { id: "bf_emma", name: "Emma", language: "en-gb", gender: "female" },
      { id: "bf_isabella", name: "Isabella", language: "en-gb", gender: "female" },
      { id: "bf_lily", name: "Lily", language: "en-gb", gender: "female" },
    ],
  },
  {
    group: "British Male",
    voices: [
      { id: "bm_daniel", name: "Daniel", language: "en-gb", gender: "male" },
      { id: "bm_fable", name: "Fable", language: "en-gb", gender: "male" },
      { id: "bm_george", name: "George", language: "en-gb", gender: "male" },
      { id: "bm_lewis", name: "Lewis", language: "en-gb", gender: "male" },
    ],
  },
];

/** Flattened list of all voice IDs for quick lookup */
export const KOKORO_VOICE_IDS = KOKORO_VOICE_GROUPS.flatMap((g) =>
  g.voices.map((v) => v.id),
);

// ========== WAV Helper ==========

function float32ToWavBlob(data: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataLength = data.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");

  // fmt subchunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data subchunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // Convert Float32 to Int16
  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ========== Module-level TTS cache ==========

let ttsInstance: any = null;
let ttsLoading: boolean = false;
let ttsLoadPromise: Promise<any> | null = null;

async function getTTSInstance(onLog?: (msg: string) => void): Promise<any> {
  if (ttsInstance) return ttsInstance;
  if (ttsLoadPromise) return ttsLoadPromise;

  ttsLoading = true;
  ttsLoadPromise = (async () => {
    try {
      const { KokoroTTS } = await import("kokoro-js");
      onLog?.("Downloading kokoro-js model from Hugging Face...");
      const tts = await KokoroTTS.from_pretrained(
        "onnx-community/Kokoro-82M-v1.0-ONNX",
        {
          dtype: "q8",
          device: "wasm",
        },
      );
      onLog?.("kokoro-js model loaded successfully.");
      ttsInstance = tts;
      return tts;
    } finally {
      ttsLoading = false;
    }
  })();

  return ttsLoadPromise;
}

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

interface AudioState {
  text: string;
  voice: string;
  speed: number;
  generating: boolean;
  modelLoading: boolean;
  result: string | null; // blob URL for playback
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

  // Project videos (output media)
  projectVideos: ProjectVideo[];
  projectVideosLoading: boolean;
  fetchProjectVideos: (projectId: string) => Promise<void>;
  selectedVideo: ProjectVideo | null;
  selectVideo: (vid: ProjectVideo | null) => void;

  // Reset
  resetAll: () => void;

  // Audio (kokoro-js TTS)
  audio: AudioState;
  setAudioText: (v: string) => void;
  setAudioVoice: (v: string) => void;
  setAudioSpeed: (v: number) => void;
  clearAudioResult: () => void;
  generateAudio: () => Promise<void>;
}

export interface ProjectImage {
  filename: string;
  url: string;
  source: "upload" | "generated";
}

export interface ProjectVideo {
  filename: string;
  url: string;
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
  prompt:
    "a 20 years old cute beaver says: Hi {{name}}, how are you? im beaver atlas.",
  duration: 5,
  generating: false,
  result: null,
  error: null,
  logs: [],
};

const initialAudio: AudioState = {
  text: "Life is like a box of chocolates. You never know what you're gonna get.",
  voice: "af_heart",
  speed: 1,
  generating: false,
  modelLoading: false,
  result: null,
  error: null,
  logs: [],
};

// ========== Store ==========

export const useGenerationStore = create<GenerationStore>((set, get) => ({
  activeTab: "video",
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ---- Audio (kokoro-js TTS) ----
  audio: { ...initialAudio },

  setAudioText: (text) =>
    set((s) => ({ audio: { ...s.audio, text, error: null } })),
  setAudioVoice: (voice) =>
    set((s) => ({ audio: { ...s.audio, voice } })),
  setAudioSpeed: (speed) =>
    set((s) => ({ audio: { ...s.audio, speed } })),
  clearAudioResult: () =>
    set((s) => ({
      audio: { ...s.audio, result: null, error: null, logs: [] },
    })),

  generateAudio: async () => {
    const { audio } = get();
    if (!audio.text.trim() || audio.generating) return;

    set((s) => ({
      audio: {
        ...s.audio,
        generating: true,
        modelLoading: true,
        error: null,
        result: null,
        logs: [],
      },
    }));

    try {
      // Load TTS model (cached after first load)
      const tts = await getTTSInstance((msg) =>
        set((s) => ({
          audio: { ...s.audio, logs: [...s.audio.logs, msg] },
        })),
      );

      set((s) => ({
        audio: { ...s.audio, modelLoading: false },
      }));

      // Generate audio
      const logMsg = `Generating speech with voice "${audio.voice}"...`;
      set((s) => ({
        audio: { ...s.audio, logs: [...s.audio.logs, logMsg] },
      }));

      const rawAudio = await tts.generate(audio.text.trim(), {
        voice: audio.voice,
        speed: audio.speed,
      });

      // Convert RawAudio to WAV blob URL for browser playback
      const sampleRate = rawAudio.sampling_rate ?? 24000;
      const wavBlob = float32ToWavBlob(rawAudio.data, sampleRate);
      const blobUrl = URL.createObjectURL(wavBlob);

      // Revoke previous blob URL if any
      if (audio.result?.startsWith("blob:")) {
        URL.revokeObjectURL(audio.result);
      }

      set((s) => ({
        audio: {
          ...s.audio,
          generating: false,
          result: blobUrl,
          logs: [
            ...s.audio.logs,
            `Done! Audio generated (${sampleRate} Hz, ${rawAudio.data.length} samples).`,
          ],
        },
      }));
    } catch (e: any) {
      set((s) => ({
        audio: {
          ...s.audio,
          generating: false,
          modelLoading: false,
          error: e?.message || String(e),
        },
      }));
    }
  },

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

  // ---- Project Videos ----
  projectVideos: [],
  projectVideosLoading: false,
  selectedVideo: null,

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

  // ---- Project Videos ----

  fetchProjectVideos: async (projectId) => {
    set({ projectVideosLoading: true });
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/videos`);
      if (!res.ok) throw new Error(await res.text());
      const videos: ProjectVideo[] = await res.json();
      const resolved = videos.map((vid) => ({
        ...vid,
        url: vid.url.startsWith("http")
          ? vid.url
          : `http://localhost:${(window as any).PORT}${vid.url}`,
      }));
      set({ projectVideos: resolved, projectVideosLoading: false });
    } catch {
      set({ projectVideosLoading: false });
    }
  },

  selectVideo: (vid) => {
    if (!vid) {
      set({ selectedVideo: null });
      return;
    }
    const fullUrl = vid.url.startsWith("http")
      ? vid.url
      : `http://localhost:${(window as any).PORT}${vid.url}`;
    set({
      selectedVideo: { ...vid, url: fullUrl },
      video: {
        ...get().video,
        result: fullUrl,
      },
    });
  },

  // ---- Reset ----
  resetAll: () =>
    set({
      activeTab: "image",
      image: { ...initialImage },
      video: { ...initialVideo },
      audio: { ...initialAudio },
      uploading: false,
      uploadError: null,
      uploadedImageUrl: null,
      uploadedImageFilename: null,
      uploadedImagePath: null,
      projectImages: [],
      selectedImage: null,
      projectVideos: [],
      projectVideosLoading: false,
      selectedVideo: null,
    }),
}));

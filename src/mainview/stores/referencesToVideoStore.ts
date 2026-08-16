import { create } from "zustand";

const API_BASE = `http://localhost:${(window as any).PORT}`;

// Abort controller for the in-flight generation request, so it can be cancelled.
let generateAbortController: AbortController | null = null;

interface ReferencesToVideoStore {
  // Model download
  downloading: boolean;
  downloaded: boolean;
  error: string | null;
  logs: string[];

  // Generation parameters
  prompt: string;
  steps: number;
  width: number;
  height: number;
  seconds: number;
  seed: number;

  // Reference media (bare filenames uploaded to this project)
  refImage1: string | null;
  refImage2: string | null;
  refAudio: string | null;

  // Generation state
  generating: boolean;
  result: string | null;
  genError: string | null;
  genLogs: string[];

  checkStatus: () => Promise<void>;
  downloadModel: () => Promise<void>;

  setPrompt: (v: string) => void;
  setSteps: (v: number) => void;
  setWidth: (v: number) => void;
  setHeight: (v: number) => void;
  setSeconds: (v: number) => void;
  setSeed: (v: number) => void;
  setRefImage1: (v: string | null) => void;
  setRefImage2: (v: string | null) => void;
  setRefAudio: (v: string | null) => void;

  uploadAudio: (
    base64: string,
    filename: string,
    projectId: string,
  ) => Promise<string | null>;
  generate: (projectId: string) => Promise<void>;
  cancelGenerate: () => void;
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

export const useReferencesToVideoStore = create<ReferencesToVideoStore>(
  (set, get) => ({
    // Model download
    downloading: false,
    downloaded: false,
    error: null,
    logs: [],

    // Generation parameters
    prompt:
      "[image1] is dancing at [image2] with [audio1] as background music",
    steps: 20,
    width: 640,
    height: 448,
    seconds: 5,
    seed: 42,

    // Reference media
    refImage1: null,
    refImage2: null,
    refAudio: null,

    // Generation state
    generating: false,
    result: null,
    genError: null,
    genLogs: [],

    checkStatus: async () => {
      try {
        const res = await fetch(`${API_BASE}/api/h3/status`);
        if (!res.ok) return;
        const data = await res.json();
        set({ downloaded: Boolean(data.downloaded) });
      } catch {
        // Leave status unchanged if the check fails.
      }
    },

    downloadModel: async () => {
      if (get().downloading) return;

      set({ downloading: true, error: null, logs: [] });

      try {
        const res = await fetch(`${API_BASE}/api/h3/download-model`, {
          method: "POST",
        });

        if (!res.ok) {
          const err = await res.text();
          set({ downloading: false, error: err });
          return;
        }

        await readSSEStream(res, (event, data) => {
          switch (event) {
            case "log":
              set((s) => ({ logs: [...s.logs, data.text as string] }));
              break;
            case "complete":
              set({ downloading: false, downloaded: true });
              break;
            case "error":
              set({
                downloading: false,
                error: data.error || "Model download failed",
              });
              break;
          }
        });
      } catch (e) {
        set({ downloading: false, error: String(e) });
      }
    },

    setPrompt: (v) => set({ prompt: v }),
    setSteps: (v) => set({ steps: v }),
    setWidth: (v) => set({ width: v }),
    setHeight: (v) => set({ height: v }),
    setSeconds: (v) => set({ seconds: v }),
    setSeed: (v) => set({ seed: v }),
    setRefImage1: (v) => set({ refImage1: v }),
    setRefImage2: (v) => set({ refImage2: v }),
    setRefAudio: (v) => set({ refAudio: v }),

    uploadAudio: async (base64, filename, projectId) => {
      try {
        const res = await fetch(`${API_BASE}/api/upload/audio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio: base64,
            filename: filename || `audio-${Date.now()}.mp3`,
            projectId,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          set({ genError: err });
          return null;
        }

        const data = await res.json();
        set({ refAudio: data.filename as string });
        return data.filename as string;
      } catch (e) {
        set({ genError: String(e) });
        return null;
      }
    },

    generate: async (projectId) => {
      if (get().generating) return;

      const { prompt, steps, width, height, seconds, seed, refImage1, refImage2, refAudio } =
        get();

      const refImages = [refImage1, refImage2].filter(
        (n): n is string => typeof n === "string" && !!n.trim(),
      );

      // Frame count derived from duration at 24fps (+1 keyframe).
      const frames = Math.max(1, Math.round(24 * seconds + 1));

      // Fresh AbortController so this run can be cancelled independently.
      generateAbortController = new AbortController();
      const signal = generateAbortController.signal;

      set({ generating: true, genError: null, genLogs: [], result: null });

      try {
        const res = await fetch(`${API_BASE}/api/h3/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt.trim(),
            refImages,
            refAudio: refAudio ?? null,
            projectId,
            steps,
            width,
            height,
            frames,
            seed,
          }),
          signal,
        });

        if (!res.ok) {
          const err = await res.text();
          set({ generating: false, genError: err });
          return;
        }

        await readSSEStream(res, (event, data) => {
          switch (event) {
            case "log":
              set((s) => ({ genLogs: [...s.genLogs, data.text as string] }));
              break;
            case "complete":
              set({
                generating: false,
                result: `http://localhost:${(window as any).PORT}/api/files?path=${encodeURIComponent(data.path)}`,
              });
              break;
            case "error":
              set({
                generating: false,
                genError: data.error || "Generation failed",
              });
              break;
          }
        });
      } catch (e: any) {
        // If the request was aborted, just stop silently (cancel already reset state).
        if (e?.name !== "AbortError") {
          set({ generating: false, genError: String(e) });
        } else {
          set({ generating: false });
        }
      } finally {
        generateAbortController = null;
      }
    },

    cancelGenerate: () => {
      if (generateAbortController) {
        generateAbortController.abort();
        generateAbortController = null;
      }
      // Immediately reset generating state so the UI returns to ready.
      set({ generating: false });
      // Also kill the backend spawn process.
      fetch(`${API_BASE}/api/render/cancel`, { method: "POST" }).catch(
        () => {},
      );
    },
  }),
);

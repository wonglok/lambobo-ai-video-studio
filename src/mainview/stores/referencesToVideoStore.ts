import { create } from "zustand";

const API_BASE = `http://localhost:${(window as any).PORT}`;

interface ReferencesToVideoStore {
  downloading: boolean;
  downloaded: boolean;
  error: string | null;
  logs: string[];
  checkStatus: () => Promise<void>;
  downloadModel: () => Promise<void>;
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
    downloading: false,
    downloaded: false,
    error: null,
    logs: [],

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
  }),
);

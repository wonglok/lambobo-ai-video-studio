import { create } from "zustand";

const API_BASE = `http://localhost:${(window as any).PORT}`;

export interface AgentStep {
  type: "thought" | "tool";
  text: string;
  detail?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  image?: string;
  steps: AgentStep[];
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `msg-${idCounter}`;
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

// ========== Store ==========

interface ChatStore {
  messages: ChatMessage[];
  sending: boolean;
  error: string | null;
  pendingImage: string | null;
  setPendingImage: (dataUrl: string | null) => void;
  sendMessage: (
    content: string,
    port: number,
    model: string,
    projectId: string,
    image?: string,
  ) => Promise<void>;
  reset: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  sending: false,
  error: null,
  pendingImage: null,

  setPendingImage: (dataUrl) => set({ pendingImage: dataUrl }),

  sendMessage: async (content, port, model, projectId, image) => {
    const text = content.trim();
    if ((!text && !image) || get().sending) return;

    // History sent to the backend: prior user/assistant turns only.
    const history = get()
      .messages.filter((m) => m.content.trim() || (m.image && m.image.trim()))
      .map((m) => ({ role: m.role, content: m.content, image: m.image }));

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      content: text,
      image,
      steps: [],
    };
    const assistantMsg: ChatMessage = {
      id: nextId(),
      role: "assistant",
      content: "",
      steps: [],
    };

    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      sending: true,
      error: null,
      pendingImage: null,
    }));

    const updateAssistant = (fn: (m: ChatMessage) => ChatMessage) =>
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantMsg.id ? fn(m) : m,
        ),
      }));

    try {
      const res = await fetch(`${API_BASE}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, port, model, projectId }),
      });

      if (!res.ok) {
        const err = await res.text();
        updateAssistant((m) => ({ ...m, content: err || "Request failed" }));
        set({ error: err || "Request failed" });
        return;
      }

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "tool":
            updateAssistant((m) => ({
              ...m,
              steps: [
                ...m.steps,
                {
                  type: "tool",
                  text: data.name as string,
                  detail: data.output as string,
                },
              ],
            }));
            break;
          case "delta":
            updateAssistant((m) => ({
              ...m,
              content: m.content + (data.text as string),
            }));
            break;
          case "error":
            set({ error: data.error || "Something went wrong" });
            break;
          case "done":
            break;
        }
      });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ sending: false });
    }
  },

  reset: () =>
    set({ messages: [], sending: false, error: null, pendingImage: null }),
}));

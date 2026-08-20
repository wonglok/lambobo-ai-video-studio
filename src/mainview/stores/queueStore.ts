import { create } from "zustand";

const API_BASE = `http://localhost:${(window as any).PORT}`;

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
  | "cancelled"
  | "paused";

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

interface QueueStore {
  tasks: QueueTask[];
  loading: boolean;
  projectId: string | null;
  paused: boolean;
  refresh: (projectId: string) => Promise<void>;
  startPolling: (projectId: string) => void;
  stopPolling: () => void;
  cancel: (projectId: string, taskId: string) => Promise<void>;
  cancelActive: (projectId: string) => Promise<void>;
  clearFinished: (projectId: string) => Promise<void>;
  pause: (projectId: string) => Promise<void>;
  resume: (projectId: string) => Promise<void>;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL_MS = 1200;

export const useQueueStore = create<QueueStore>((set, get) => ({
  tasks: [],
  loading: false,
  projectId: null,
  paused: false,

  refresh: async (projectId) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/queue?projectId=${encodeURIComponent(projectId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { tasks: QueueTask[]; paused: boolean };
      set({
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        paused: Boolean(data.paused),
        projectId,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  startPolling: (projectId) => {
    get().stopPolling();
    set({ projectId, loading: true });
    void get().refresh(projectId);
    pollTimer = setInterval(() => {
      void get().refresh(projectId);
    }, POLL_INTERVAL_MS);
  },

  stopPolling: () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    set({ tasks: [], projectId: null, loading: false, paused: false });
  },

  cancel: async (projectId, taskId) => {
    try {
      await fetch(`${API_BASE}/api/queue/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, taskId }),
      });
    } catch {
      // ignore cancel failures
    }
    void get().refresh(projectId);
  },

  cancelActive: async (projectId) => {
    try {
      await fetch(`${API_BASE}/api/queue/cancel-active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
    } catch {
      // ignore cancel failures
    }
    void get().refresh(projectId);
  },

  clearFinished: async (projectId) => {
    try {
      await fetch(`${API_BASE}/api/queue/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
    } catch {
      // ignore clear failures
    }
    void get().refresh(projectId);
  },

  pause: async (projectId) => {
    try {
      await fetch(`${API_BASE}/api/queue/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
    } catch {
      // ignore pause failures
    }
    void get().refresh(projectId);
  },

  resume: async (projectId) => {
    try {
      await fetch(`${API_BASE}/api/queue/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
    } catch {
      // ignore resume failures
    }
    void get().refresh(projectId);
  },
}));

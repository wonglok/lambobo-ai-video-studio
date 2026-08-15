import { create } from "zustand";

export interface StoryCharacter {
  filename: string;
  source: "upload" | "generated";
}

export interface Story {
  id: string;
  projectId: string;
  title: string;
  characters: StoryCharacter[];
  scenes: string[];
  createdAt: string;
  updatedAt: string;
}

interface StoryStore {
  stories: Story[];
  loading: boolean;
  error: string | null;

  fetchStories: (projectId: string) => Promise<void>;
  createStory: (projectId: string, title: string) => Promise<Story | null>;
  updateStory: (
    id: string,
    data: Partial<Pick<Story, "title" | "characters" | "scenes">>,
  ) => Promise<Story | null>;
  deleteStory: (id: string) => Promise<boolean>;
}

const API_BASE = `http://localhost:${(window as any).PORT}`;

/** Normalize a story from the backend, tolerating the legacy single-character shape. */
function normalizeStory(s: any): Story {
  return {
    id: String(s?.id ?? ""),
    projectId: String(s?.projectId ?? ""),
    title: String(s?.title ?? ""),
    characters: Array.isArray(s?.characters)
      ? s.characters
      : s?.character
        ? [s.character]
        : [],
    scenes: Array.isArray(s?.scenes) ? s.scenes : [],
    createdAt: String(s?.createdAt ?? ""),
    updatedAt: String(s?.updatedAt ?? ""),
  };
}

export const useStoryStore = create<StoryStore>((set, get) => ({
  stories: [],
  loading: false,
  error: null,

  fetchStories: async (projectId) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(
        `${API_BASE}/api/stories?projectId=${encodeURIComponent(projectId)}`,
      );
      if (!res.ok) throw new Error(await res.text());
      const stories = (await res.json()).map(normalizeStory);
      set({ stories, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  createStory: async (projectId, title) => {
    set({ error: null });
    try {
      const res = await fetch(`${API_BASE}/api/stories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, title }),
      });
      if (!res.ok) throw new Error(await res.text());
      const story = normalizeStory(await res.json());
      set({ stories: [...get().stories, story] });
      return story;
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  updateStory: async (id, data) => {
    set({ error: null });
    try {
      const res = await fetch(`${API_BASE}/api/stories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = normalizeStory(await res.json());
      set({ stories: get().stories.map((s) => (s.id === id ? updated : s)) });
      return updated;
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  deleteStory: async (id) => {
    set({ error: null });
    try {
      const res = await fetch(`${API_BASE}/api/stories/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      set({ stories: get().stories.filter((s) => s.id !== id) });
      return true;
    } catch (e) {
      set({ error: String(e) });
      return false;
    }
  },
}));

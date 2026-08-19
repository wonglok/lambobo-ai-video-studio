import { create } from "zustand";
import {
  loadMovieStudioState,
  saveMovieStudioState,
} from "../lib/movieStudioStorage";

const API_BASE = `http://localhost:${(window as any).PORT}`;

export interface MovieCharacter {
  slug: string;
  name: string;
  imagePrompt: string;
}

export interface MoviePlace {
  slug: string;
  name: string;
  imagePrompt: string;
}

export interface MovieScriptLine {
  characterSlug: string;
  line: string;
}

export interface MovieScene {
  slug: string;
  duration: number;
  description: string;
  characterSlugs: string[];
  placeSlug: string;
  scriptLines: MovieScriptLine[];
  voiceOver: string;
  imagePrompt: string;
}

export interface MovieStudioResult {
  characters: MovieCharacter[];
  places: MoviePlace[];
  scenes: MovieScene[];
}

interface MovieStudioStore {
  idea: string;
  projectId: string | null;
  hydrated: boolean;
  generating: boolean;
  result: MovieStudioResult | null;
  error: string | null;
  setIdea: (v: string) => void;
  hydrate: (projectId: string) => Promise<void>;
  generate: (projectId: string, model: string) => Promise<void>;
  reset: () => void;
}

export const useMovieStudioStore = create<MovieStudioStore>((set, get) => ({
  idea: "",
  projectId: null,
  hydrated: false,
  generating: false,
  result: null,
  error: null,

  setIdea: (idea) => {
    set({ idea, error: null });
    const { projectId } = get();
    if (projectId) void saveMovieStudioState(projectId, { idea });
  },

  hydrate: async (projectId) => {
    // No-op if already hydrated for this project.
    if (get().hydrated && get().projectId === projectId) return;

    // Switching projects: reset to defaults so the previous project's idea
    // doesn't leak through, then load the stored state (if any) below.
    const previous = get().projectId;
    if (previous !== null && previous !== projectId) {
      get().reset();
    }
    set({ hydrated: true, projectId });

    const stored = await loadMovieStudioState(projectId);
    if (!stored) return;
    set({ idea: stored.idea ?? "" });
  },

  generate: async (projectId, model) => {
    const idea = get().idea.trim();
    if (!idea || get().generating) return;

    set({ generating: true, error: null, result: null });

    try {
      const res = await fetch(`${API_BASE}/api/movie-studio/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, model, projectId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as MovieStudioResult;
      set({ result: data, generating: false });
    } catch (e) {
      set({ error: String(e), generating: false });
    }
  },

  reset: () =>
    set({ idea: "", generating: false, result: null, error: null }),
}));

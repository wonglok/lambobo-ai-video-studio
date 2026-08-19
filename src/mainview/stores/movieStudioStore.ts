import { create } from "zustand";

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

export interface MovieScene {
  slug: string;
  description: string;
  characterSlugs: string[];
  placeSlug: string;
  imagePrompt: string;
}

export interface MovieStudioResult {
  characters: MovieCharacter[];
  places: MoviePlace[];
  scenes: MovieScene[];
}

interface MovieStudioStore {
  idea: string;
  generating: boolean;
  result: MovieStudioResult | null;
  error: string | null;
  setIdea: (v: string) => void;
  generate: (projectId: string, model: string) => Promise<void>;
  reset: () => void;
}

export const useMovieStudioStore = create<MovieStudioStore>((set, get) => ({
  idea: "",
  generating: false,
  result: null,
  error: null,

  setIdea: (idea) => set({ idea, error: null }),

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

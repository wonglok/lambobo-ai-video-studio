import { create } from "zustand";
import {
  loadMovieStudioState,
  saveMovieStudioState,
} from "../lib/movieStudioStorage";

const API_BASE = `http://localhost:${(window as any).PORT}`;

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

export interface AssetImage {
  kind: "character" | "place";
  slug: string;
  filename: string;
  url: string;
  updatedAt: number;
}

interface MovieStudioStore {
  idea: string;
  projectId: string | null;
  hydrated: boolean;
  generating: boolean;
  result: MovieStudioResult | null;
  error: string | null;
  rendering: boolean;
  renderStatus: string | null;
  renderLogs: string[];
  renderError: string | null;
  assets: AssetImage[];
  assetsRendering: boolean;
  assetStatus: string | null;
  assetsError: string | null;
  regenerating: string[];
  setIdea: (v: string) => void;
  hydrate: (projectId: string) => Promise<void>;
  generate: (projectId: string, model: string) => Promise<void>;
  render: (projectId: string) => Promise<void>;
  renderAssets: (projectId: string) => Promise<void>;
  regenerateAsset: (
    projectId: string,
    kind: "character" | "place",
    slug: string,
    prompt: string,
  ) => Promise<void>;
  reset: () => void;
}

export const useMovieStudioStore = create<MovieStudioStore>((set, get) => ({
  idea: "",
  projectId: null,
  hydrated: false,
  generating: false,
  result: null,
  error: null,
  rendering: false,
  renderStatus: null,
  renderLogs: [],
  renderError: null,
  assets: [],
  assetsRendering: false,
  assetStatus: null,
  assetsError: null,
  regenerating: [],

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

  render: async (projectId) => {
    const result = get().result;
    if (!result || get().rendering) return;

    set({
      rendering: true,
      renderStatus: "Starting render...",
      renderLogs: [],
      renderError: null,
    });

    try {
      const res = await fetch(`${API_BASE}/api/movie-studio/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...result }),
      });
      if (!res.ok) throw new Error(await res.text());

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "progress":
            set({ renderStatus: data.label as string });
            break;
          case "image":
            set((s) => ({
              renderStatus: `Generated ${data.kind}: ${data.slug}`,
              renderLogs: [...s.renderLogs, `✓ ${data.kind}: ${data.filename}`],
            }));
            break;
          case "video":
            set((s) => ({
              renderStatus: `Generated video: ${data.slug}`,
              renderLogs: [...s.renderLogs, `✓ video: ${data.filename}`],
            }));
            break;
          case "log":
            set((s) => ({
              renderLogs: [...s.renderLogs, data.text as string],
            }));
            break;
          case "error":
            set({ renderError: data.error || "Render failed" });
            break;
          case "complete":
            set({ renderStatus: "Render complete" });
            break;
        }
      });
    } catch (e) {
      set({ renderError: String(e) });
    } finally {
      set({ rendering: false });
    }
  },

  renderAssets: async (projectId) => {
    const result = get().result;
    if (!result || get().assetsRendering) return;

    set({
      assetsRendering: true,
      assetStatus: "Rendering assets...",
      assetsError: null,
    });

    try {
      const res = await fetch(`${API_BASE}/api/movie-studio/render-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          characters: result.characters,
          places: result.places,
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "progress":
            set({ assetStatus: data.label as string });
            break;
          case "image": {
            const img: AssetImage = {
              kind: data.kind,
              slug: data.slug,
              filename: data.filename,
              url: data.url,
              updatedAt: Date.now(),
            };
            set((s) => {
              const key = `${img.kind}:${img.slug}`;
              const filtered = s.assets.filter(
                (a) => `${a.kind}:${a.slug}` !== key,
              );
              return {
                assets: [...filtered, img],
                assetStatus: `Generated ${img.kind}: ${img.slug}`,
              };
            });
            break;
          }
          case "error":
            set({ assetsError: data.error || "Asset render failed" });
            break;
          case "complete":
            set({ assetStatus: "Assets rendered" });
            break;
        }
      });
    } catch (e) {
      set({ assetsError: String(e) });
    } finally {
      set({ assetsRendering: false });
    }
  },

  regenerateAsset: async (projectId, kind, slug, prompt) => {
    const key = `${kind}:${slug}`;
    if (get().regenerating.includes(key)) return;

    set((s) => ({
      regenerating: [...s.regenerating, key],
      assetsError: null,
    }));

    try {
      const res = await fetch(`${API_BASE}/api/movie-studio/render-asset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, kind, slug, prompt }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { filename: string; url: string };
      set((s) => {
        const filtered = s.assets.filter(
          (a) => `${a.kind}:${a.slug}` !== key,
        );
        return {
          assets: [...filtered, { kind, slug, ...data, updatedAt: Date.now() }],
          regenerating: s.regenerating.filter((k) => k !== key),
        };
      });
    } catch (e) {
      set((s) => ({
        assetsError: String(e),
        regenerating: s.regenerating.filter((k) => k !== key),
      }));
    }
  },

  reset: () =>
    set({
      idea: "",
      generating: false,
      result: null,
      error: null,
      rendering: false,
      renderStatus: null,
      renderLogs: [],
      renderError: null,
      assets: [],
      assetsRendering: false,
      assetStatus: null,
      assetsError: null,
      regenerating: [],
    }),
}));

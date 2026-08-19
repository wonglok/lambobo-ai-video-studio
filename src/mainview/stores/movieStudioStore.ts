import { create } from "zustand";

const API_BASE = `http://localhost:${(window as any).PORT}`;

let movieStudioAbortController: AbortController | null = null;

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

export interface RenderedScene {
  slug: string;
  imageUrl: string | null;
  videoUrl: string | null;
}

function upsertScene(
  scenes: RenderedScene[],
  slug: string,
  patch: Partial<RenderedScene>,
): RenderedScene[] {
  const existing = scenes.find((s) => s.slug === slug);
  if (existing) {
    return scenes.map((s) => (s.slug === slug ? { ...s, ...patch } : s));
  }
  return [...scenes, { slug, imageUrl: null, videoUrl: null, ...patch }];
}

export interface SceneVideo {
  slug: string;
  filename: string;
  url: string;
  updatedAt: number;
}

function upsertVideo(
  videos: SceneVideo[],
  slug: string,
  patch: Partial<SceneVideo>,
): SceneVideo[] {
  const existing = videos.find((v) => v.slug === slug);
  if (existing) {
    return videos.map((v) => (v.slug === slug ? { ...v, ...patch } : v));
  }
  return [...videos, { slug, filename: "", url: "", updatedAt: 0, ...patch }];
}

export interface SceneImage {
  slug: string;
  filename: string;
  url: string;
  updatedAt: number;
}

function upsertSceneImage(
  images: SceneImage[],
  slug: string,
  patch: Partial<SceneImage>,
): SceneImage[] {
  const existing = images.find((v) => v.slug === slug);
  if (existing) {
    return images.map((v) => (v.slug === slug ? { ...v, ...patch } : v));
  }
  return [...images, { slug, filename: "", url: "", updatedAt: 0, ...patch }];
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
  renderProgress: { current: number; total: number } | null;
  assets: AssetImage[];
  assetsRendering: boolean;
  assetStatus: string | null;
  assetsError: string | null;
  regenerating: string[];
  renderedScenes: RenderedScene[];
  videos: SceneVideo[];
  videosRendering: boolean;
  videoStatus: string | null;
  videosError: string | null;
  videoProgress: { current: number; total: number } | null;
  regeneratingVideos: string[];
  sceneImages: SceneImage[];
  sceneImagesRendering: boolean;
  sceneImageStatus: string | null;
  sceneImagesError: string | null;
  sceneImageProgress: { current: number; total: number } | null;
  regeneratingSceneImages: string[];
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
  renderVideos: (projectId: string) => Promise<void>;
  regenerateVideo: (projectId: string, slug: string) => Promise<void>;
  renderSceneImages: (projectId: string) => Promise<void>;
  regenerateSceneImage: (projectId: string, slug: string) => Promise<void>;
  stop: () => void;
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
  renderProgress: null,
  assets: [],
  assetsRendering: false,
  assetStatus: null,
  assetsError: null,
  regenerating: [],
  renderedScenes: [],
  videos: [],
  videosRendering: false,
  videoStatus: null,
  videosError: null,
  videoProgress: null,
  regeneratingVideos: [],
  sceneImages: [],
  sceneImagesRendering: false,
  sceneImageStatus: null,
  sceneImagesError: null,
  sceneImageProgress: null,
  regeneratingSceneImages: [],

  setIdea: (idea) => {
    set({ idea, error: null });
    persistMovieStudioState();
  },

  hydrate: async (projectId) => {
    // Switching projects: reset to defaults so the previous project's idea
    // doesn't leak through, then load the stored state (if any) below.
    const previous = get().projectId;
    if (previous !== null && previous !== projectId) {
      get().reset();
    }
    set({ hydrated: true, projectId });

    try {
      const res = await fetch(
        `${API_BASE}/api/movie-studio/state?projectId=${encodeURIComponent(projectId)}`,
      );
      if (!res.ok) return;
      const stored = await res.json();
      if (!stored) return;
      set({
        idea: stored.idea ?? "",
        result: stored.result ?? null,
        assets: Array.isArray(stored.assets) ? stored.assets : [],
        videos: Array.isArray(stored.videos) ? stored.videos : [],
        sceneImages: Array.isArray(stored.sceneImages) ? stored.sceneImages : [],
      });
    } catch {
      // Ignore — keep in-memory defaults.
    }
  },

  generate: async (projectId, model) => {
    const idea = get().idea.trim();
    if (!idea || get().generating) return;

    set({ generating: true, error: null, result: null });
    movieStudioAbortController = new AbortController();
    const signal = movieStudioAbortController.signal;

    try {
      const res = await fetch(`${API_BASE}/api/movie-studio/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, model, projectId }),
        signal,
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as MovieStudioResult;
      set({ result: data, generating: false });
      persistMovieStudioState();
    } catch (e) {
      if ((e as any)?.name !== "AbortError") {
        set({ error: String(e), generating: false });
      }
    } finally {
      movieStudioAbortController = null;
      set({ generating: false });
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
      renderProgress: null,
      renderedScenes: [],
    });
    movieStudioAbortController = new AbortController();
    const signal = movieStudioAbortController.signal;

    try {
      const res = await fetch(`${API_BASE}/api/movie-studio/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...result }),
        signal,
      });
      if (!res.ok) throw new Error(await res.text());

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "progress":
            set({
              renderStatus: data.label as string,
              renderProgress: {
                current: Number(data.current) || 0,
                total: Number(data.total) || 0,
              },
            });
            break;
          case "image": {
            const isScene = data.kind === "scene";
            set((s) => ({
              renderStatus: `Generated ${data.kind}: ${data.slug}`,
              renderLogs: [...s.renderLogs, `✓ ${data.kind}: ${data.filename}`],
              renderedScenes: isScene
                ? upsertScene(s.renderedScenes, data.slug, {
                    imageUrl: data.url as string,
                  })
                : s.renderedScenes,
            }));
            break;
          }
          case "video":
            set((s) => ({
              renderStatus: `Generated video: ${data.slug}`,
              renderLogs: [...s.renderLogs, `✓ video: ${data.filename}`],
              renderedScenes: upsertScene(s.renderedScenes, data.slug, {
                videoUrl: data.url as string,
              }),
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
      if ((e as any)?.name !== "AbortError") {
        set({ renderError: String(e) });
      }
    } finally {
      movieStudioAbortController = null;
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
    movieStudioAbortController = new AbortController();
    const signal = movieStudioAbortController.signal;

    try {
      const res = await fetch(`${API_BASE}/api/movie-studio/render-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          characters: result.characters,
          places: result.places,
        }),
        signal,
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
      if ((e as any)?.name !== "AbortError") {
        set({ assetsError: String(e) });
      }
    } finally {
      movieStudioAbortController = null;
      set({ assetsRendering: false });
      persistMovieStudioState();
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
      persistMovieStudioState();
    } catch (e) {
      set((s) => ({
        assetsError: String(e),
        regenerating: s.regenerating.filter((k) => k !== key),
      }));
    }
  },

  renderVideos: async (projectId) => {
    const result = get().result;
    if (!result || get().videosRendering) return;

    set({
      videosRendering: true,
      videoStatus: "Rendering videos...",
      videosError: null,
      videoProgress: null,
    });
    movieStudioAbortController = new AbortController();
    const signal = movieStudioAbortController.signal;

    try {
      const res = await fetch(`${API_BASE}/api/movie-studio/render-videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          characters: result.characters,
          scenes: result.scenes,
        }),
        signal,
      });
      if (!res.ok) throw new Error(await res.text());

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "progress":
            set({
              videoStatus: data.label as string,
              videoProgress: {
                current: Number(data.current) || 0,
                total: Number(data.total) || 0,
              },
            });
            break;
          case "video":
            set((s) => ({
              videos: upsertVideo(s.videos, data.slug, {
                filename: data.filename,
                url: data.url,
                updatedAt: Date.now(),
              }),
              videoStatus: `Generated video: ${data.slug}`,
            }));
            break;
          case "error":
            set({ videosError: data.error || "Video render failed" });
            break;
          case "complete":
            set({ videoStatus: "Videos rendered" });
            break;
        }
      });
    } catch (e) {
      if ((e as any)?.name !== "AbortError") {
        set({ videosError: String(e) });
      }
    } finally {
      movieStudioAbortController = null;
      set({ videosRendering: false });
      persistMovieStudioState();
    }
  },

  regenerateVideo: async (projectId, slug) => {
    const result = get().result;
    if (!result || get().regeneratingVideos.includes(slug)) return;
    const scene = result.scenes.find((s) => s.slug === slug);
    if (!scene) return;

    set((s) => ({
      regeneratingVideos: [...s.regeneratingVideos, slug],
      videosError: null,
    }));

    try {
      const res = await fetch(`${API_BASE}/api/movie-studio/render-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, scene, characters: result.characters }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { filename: string; url: string };
      set((s) => ({
        videos: upsertVideo(s.videos, slug, {
          filename: data.filename,
          url: data.url,
          updatedAt: Date.now(),
        }),
        regeneratingVideos: s.regeneratingVideos.filter((k) => k !== slug),
      }));
      persistMovieStudioState();
    } catch (e) {
      set((s) => ({
        videosError: String(e),
        regeneratingVideos: s.regeneratingVideos.filter((k) => k !== slug),
      }));
    }
  },

  renderSceneImages: async (projectId) => {
    const result = get().result;
    if (!result || get().sceneImagesRendering) return;

    set({
      sceneImagesRendering: true,
      sceneImageStatus: "Rendering scene images...",
      sceneImagesError: null,
      sceneImageProgress: null,
    });
    movieStudioAbortController = new AbortController();
    const signal = movieStudioAbortController.signal;

    try {
      const res = await fetch(
        `${API_BASE}/api/movie-studio/render-scene-images`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, scenes: result.scenes }),
          signal,
        },
      );
      if (!res.ok) throw new Error(await res.text());

      await readSSEStream(res, (event, data) => {
        switch (event) {
          case "progress":
            set({
              sceneImageStatus: data.label as string,
              sceneImageProgress: {
                current: Number(data.current) || 0,
                total: Number(data.total) || 0,
              },
            });
            break;
          case "image":
            set((s) => ({
              sceneImages: upsertSceneImage(s.sceneImages, data.slug, {
                filename: data.filename,
                url: data.url,
                updatedAt: Date.now(),
              }),
              sceneImageStatus: `Generated scene image: ${data.slug}`,
            }));
            break;
          case "error":
            set({
              sceneImagesError: data.error || "Scene image render failed",
            });
            break;
          case "complete":
            set({ sceneImageStatus: "Scene images rendered" });
            break;
        }
      });
    } catch (e) {
      if ((e as any)?.name !== "AbortError") {
        set({ sceneImagesError: String(e) });
      }
    } finally {
      movieStudioAbortController = null;
      set({ sceneImagesRendering: false });
      persistMovieStudioState();
    }
  },

  regenerateSceneImage: async (projectId, slug) => {
    const result = get().result;
    if (!result || get().regeneratingSceneImages.includes(slug)) return;
    const scene = result.scenes.find((s) => s.slug === slug);
    if (!scene) return;

    set((s) => ({
      regeneratingSceneImages: [...s.regeneratingSceneImages, slug],
      sceneImagesError: null,
    }));

    try {
      const res = await fetch(
        `${API_BASE}/api/movie-studio/render-scene-image`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, scene }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { filename: string; url: string };
      set((s) => ({
        sceneImages: upsertSceneImage(s.sceneImages, slug, {
          filename: data.filename,
          url: data.url,
          updatedAt: Date.now(),
        }),
        regeneratingSceneImages: s.regeneratingSceneImages.filter(
          (k) => k !== slug,
        ),
      }));
      persistMovieStudioState();
    } catch (e) {
      set((s) => ({
        sceneImagesError: String(e),
        regeneratingSceneImages: s.regeneratingSceneImages.filter(
          (k) => k !== slug,
        ),
      }));
    }
  },

  stop: () => {
    if (movieStudioAbortController) {
      movieStudioAbortController.abort();
      movieStudioAbortController = null;
    }
    fetch(`${API_BASE}/api/render/cancel`, { method: "POST" }).catch(() => {});
    set({
      generating: false,
      rendering: false,
      assetsRendering: false,
      videosRendering: false,
    });
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
      renderProgress: null,
      assets: [],
      assetsRendering: false,
      assetStatus: null,
      assetsError: null,
      regenerating: [],
      renderedScenes: [],
      videos: [],
      videosRendering: false,
      videoStatus: null,
      videosError: null,
      videoProgress: null,
      regeneratingVideos: [],
      sceneImages: [],
      sceneImagesRendering: false,
      sceneImageStatus: null,
      sceneImagesError: null,
      sceneImageProgress: null,
      regeneratingSceneImages: [],
    }),
}));

function persistMovieStudioState() {
  const s = useMovieStudioStore.getState();
  if (!s.projectId) return;
  fetch(`${API_BASE}/api/movie-studio/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: s.projectId,
      idea: s.idea,
      result: s.result,
      assets: s.assets,
      videos: s.videos,
      sceneImages: s.sceneImages,
    }),
  }).catch(() => {});
}

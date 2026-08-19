import localforage from "localforage";
import type { MovieStudioResult } from "../stores/movieStudioStore";

// Persisted "UI state" for the Movie Studio tab: the idea box plus the latest
// generated production bible (characters/places/scenes) so it can be autoloaded.
// Transient state (generating, error, render logs) is intentionally not persisted.
export interface PersistedMovieStudioState {
  idea: string;
  result: MovieStudioResult | null;
}

const store = localforage.createInstance({
  name: "lambobo-studio",
  storeName: "movie-studio",
});

// Each project keeps its own persisted Movie Studio state, keyed by projectId
// so switching projects restores the right idea.
function storageKey(projectId: string): string {
  return `movie-studio-ui-state:${projectId}`;
}

export async function loadMovieStudioState(
  projectId: string,
): Promise<PersistedMovieStudioState | null> {
  try {
    const value = await store.getItem<PersistedMovieStudioState>(
      storageKey(projectId),
    );
    return value ?? null;
  } catch {
    return null;
  }
}

export async function saveMovieStudioState(
  projectId: string,
  state: PersistedMovieStudioState,
): Promise<void> {
  try {
    await store.setItem(storageKey(projectId), state);
  } catch {
    // Ignore persistence failures — the UI keeps working in memory.
  }
}

export async function clearMovieStudioState(projectId: string): Promise<void> {
  try {
    await store.removeItem(storageKey(projectId));
  } catch {
    // Ignore — nothing to clear.
  }
}

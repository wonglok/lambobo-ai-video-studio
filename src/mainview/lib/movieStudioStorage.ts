import localforage from "localforage";

// Persisted "UI state" for the Movie Studio tab: the editable idea box.
// Transient state (generating, result, error) is intentionally not persisted —
// the generated tables are already written to disk under studio/:projectId/data.
export interface PersistedMovieStudioState {
  idea: string;
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

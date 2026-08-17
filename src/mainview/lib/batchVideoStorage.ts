import localforage from "localforage";
import type {
  AspectRatio,
  Resolution,
  VideoMode,
} from "../stores/generationStore";

// Persisted "UI state" for the batch video tab: the editable setup (rows +
// shared settings). Transient generation state (status, results, logs) is
// intentionally not persisted.
export interface PersistedBatchRow {
  id: string;
  prompt: string;
  imagePath: string | null;
  imageUrl: string | null;
  imageFilename: string | null;
}

export interface PersistedBatchVideoState {
  rows: PersistedBatchRow[];
  duration: number;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  mode: VideoMode;
}

const STORAGE_KEY = "batch-video-ui-state";

const store = localforage.createInstance({
  name: "lambobo-studio",
  storeName: "batch-video",
});

export async function loadBatchVideoState(): Promise<PersistedBatchVideoState | null> {
  try {
    const value = await store.getItem<PersistedBatchVideoState>(STORAGE_KEY);
    return value ?? null;
  } catch {
    return null;
  }
}

export async function saveBatchVideoState(
  state: PersistedBatchVideoState,
): Promise<void> {
  try {
    await store.setItem(STORAGE_KEY, state);
  } catch {
    // Ignore persistence failures — the UI keeps working in memory.
  }
}

export async function clearBatchVideoState(): Promise<void> {
  try {
    await store.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — nothing to clear.
  }
}

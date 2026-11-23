import { IndexeddbPersistence } from "y-indexeddb";
import type { Shared } from "./doc";

// Local-first durability. The document is written to IndexedDB on every change,
// so a crash, a closed tab, or a cold start with no network still comes back to
// the last known state. The WebSocket layer is an *accelerator* for sharing —
// it is never the source of truth.

export interface LocalStore {
  whenReady: Promise<void>;
  destroy: () => void;
}

export function attachLocalStore(shared: Shared, workspace: string): LocalStore {
  const idb = new IndexeddbPersistence(`continuum:${workspace}`, shared.doc);
  const whenReady = new Promise<void>((resolve) => {
    idb.once("synced", () => resolve());
  });
  return {
    whenReady,
    destroy: () => void idb.destroy(),
  };
}

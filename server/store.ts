import * as Y from "yjs";
import { db } from "./db";
import { config } from "./config";

// Durable persistence for a workspace's Yjs document, as an append-only update
// log plus periodic snapshots. Loading replays the latest snapshot and every
// update after it; once the log grows past a threshold we fold it back into a
// fresh snapshot and prune. This is the real version of the "append-only log"
// the architecture notes promised.

const insertUpdate = db.prepare(
  "INSERT INTO doc_updates (workspace_id, update_blob, created_at) VALUES (?, ?, ?)",
);
const selectUpdates = db.prepare(
  "SELECT id, update_blob FROM doc_updates WHERE workspace_id = ? AND id > ? ORDER BY id ASC",
);
const selectSnapshot = db.prepare(
  "SELECT snapshot, seq FROM doc_snapshots WHERE workspace_id = ?",
);
const upsertSnapshot = db.prepare(
  `INSERT INTO doc_snapshots (workspace_id, snapshot, seq, updated_at) VALUES (?, ?, ?, ?)
   ON CONFLICT(workspace_id) DO UPDATE SET
     snapshot = excluded.snapshot, seq = excluded.seq, updated_at = excluded.updated_at`,
);
const deleteUpdatesUpTo = db.prepare(
  "DELETE FROM doc_updates WHERE workspace_id = ? AND id <= ?",
);
const countUpdates = db.prepare(
  "SELECT COUNT(*) AS n, MAX(id) AS maxId FROM doc_updates WHERE workspace_id = ?",
);

function toU8(value: unknown): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBufferLike);
}

export function loadDoc(workspaceId: string): Y.Doc {
  const doc = new Y.Doc();
  let seq = 0;
  const snap = selectSnapshot.get(workspaceId) as { snapshot: Uint8Array; seq: number } | undefined;
  if (snap) {
    Y.applyUpdate(doc, toU8(snap.snapshot));
    seq = Number(snap.seq);
  }
  const rows = selectUpdates.all(workspaceId, seq) as { id: number; update_blob: Uint8Array }[];
  for (const row of rows) Y.applyUpdate(doc, toU8(row.update_blob));
  return doc;
}

export function persistUpdate(workspaceId: string, update: Uint8Array): void {
  insertUpdate.run(workspaceId, Buffer.from(update), Date.now());
}

/** Fold the update log into a snapshot when it gets long, and prune it. */
export function maybeCompact(workspaceId: string, doc: Y.Doc): void {
  const row = countUpdates.get(workspaceId) as { n: number; maxId: number | null };
  if (!row || row.n < config.compactEvery || row.maxId == null) return;
  const snapshot = Y.encodeStateAsUpdate(doc);
  upsertSnapshot.run(workspaceId, Buffer.from(snapshot), row.maxId, Date.now());
  deleteUpdatesUpTo.run(workspaceId, row.maxId);
}

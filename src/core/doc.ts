import * as Y from "yjs";

// The shared document. Everything a collaborator must agree on lives here as a
// CRDT, so concurrent edits from any device merge without a central referee.
//
// Three layers, deliberately separated:
//
//   widgets  — the committed dashboard (what "Save" produces)
//   drafts   — per-user unsaved edits, so in-progress work is never lost on a
//              device switch or crash
//   sessions — per-user operational state (selection, workflow step, scroll,
//              half-filled forms) that lets a new device *resume*, not just
//              reload
//
// Keeping drafts and session state out of `widgets` is what separates Continuum
// from an ordinary collaborative editor: we reconstruct the operator, not only
// the data.

export type WidgetType = "metric" | "chart" | "table" | "note" | "status";

export interface Shared {
  doc: Y.Doc;
  meta: Y.Map<unknown>;
  widgets: Y.Map<Y.Map<unknown>>;
  drafts: Y.Map<Y.Map<unknown>>;
  sessions: Y.Map<Y.Map<unknown>>;
  log: Y.Array<LogEntry>;
}

export interface LogEntry {
  id: string;
  ts: number;
  kind: "merge" | "commit" | "join" | "offline" | "online";
  actor: string;
  message: string;
}

export function createShared(): Shared {
  const doc = new Y.Doc();
  const meta = doc.getMap<unknown>("meta");
  const widgets = doc.getMap<Y.Map<unknown>>("widgets");
  const drafts = doc.getMap<Y.Map<unknown>>("drafts");
  const sessions = doc.getMap<Y.Map<unknown>>("sessions");
  const log = doc.getArray<LogEntry>("log");
  return { doc, meta, widgets, drafts, sessions, log };
}

export const WORKFLOW_STEPS = ["Layout", "Configure", "Review", "Publish"] as const;
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number];

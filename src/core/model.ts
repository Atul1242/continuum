import * as Y from "yjs";
import type { Shared, WidgetType, LogEntry } from "./doc";

// Domain operations over the shared document. UI code never pokes at the raw
// Yjs structures directly — it goes through these functions so every mutation
// is a single, well-formed transaction with a known origin.

export interface WidgetView {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  title: string;
  config: Record<string, unknown>;
  createdBy: string;
}

const DEFAULT_SIZE: Record<WidgetType, { w: number; h: number }> = {
  metric: { w: 3, h: 2 },
  chart: { w: 5, h: 4 },
  table: { w: 6, h: 4 },
  note: { w: 4, h: 3 },
  status: { w: 3, h: 2 },
};

function defaultConfig(type: WidgetType): Record<string, unknown> {
  switch (type) {
    case "metric":
      return { value: "0", unit: "", trend: 0 };
    case "chart":
      return { series: [4, 8, 6, 12, 9, 15, 11], kind: "bar" };
    case "table":
      return { rows: "Region, Value\nNorth, 128\nSouth, 94" };
    case "note":
      return {};
    case "status":
      return { state: "ok", label: "Operational" };
  }
}

function rid(): string {
  return `w_${Math.random().toString(36).slice(2, 9)}`;
}

function topZ(shared: Shared): number {
  let max = 0;
  shared.widgets.forEach((w) => {
    max = Math.max(max, (w.get("z") as number) ?? 0);
  });
  return max + 1;
}

export function addWidget(
  shared: Shared,
  type: WidgetType,
  actor: string,
  at?: { x: number; y: number },
): string {
  const id = rid();
  const size = DEFAULT_SIZE[type];
  shared.doc.transact(() => {
    const w = new Y.Map<unknown>();
    w.set("id", id);
    w.set("type", type);
    w.set("x", at?.x ?? 0);
    w.set("y", at?.y ?? 0);
    w.set("w", size.w);
    w.set("h", size.h);
    w.set("z", topZ(shared));
    w.set("title", titleFor(type));
    w.set("config", defaultConfig(type));
    w.set("createdBy", actor);
    if (type === "note") {
      const body = new Y.Text();
      body.insert(0, "Type here — this note merges live across every device.");
      w.set("body", body);
    }
    shared.widgets.set(id, w);
  }, actor);
  return id;
}

function titleFor(type: WidgetType): string {
  const names: Record<WidgetType, string> = {
    metric: "New metric",
    chart: "New chart",
    table: "New table",
    note: "Note",
    status: "Service status",
  };
  return names[type];
}

export function moveWidget(shared: Shared, id: string, x: number, y: number, actor: string): void {
  const w = shared.widgets.get(id);
  if (!w) return;
  shared.doc.transact(() => {
    w.set("x", Math.max(0, x));
    w.set("y", Math.max(0, y));
    w.set("z", topZ(shared));
  }, actor);
}

export function resizeWidget(shared: Shared, id: string, w: number, h: number, actor: string): void {
  const widget = shared.widgets.get(id);
  if (!widget) return;
  shared.doc.transact(() => {
    widget.set("w", Math.max(2, Math.min(16, Math.round(w))));
    widget.set("h", Math.max(2, Math.min(12, Math.round(h))));
  }, actor);
}

export function removeWidget(shared: Shared, id: string, actor: string): void {
  shared.doc.transact(() => {
    shared.widgets.delete(id);
    shared.drafts.forEach((_d, key) => {
      if (key.endsWith(`::${id}`)) shared.drafts.delete(key);
    });
  }, actor);
}

export function readWidget(w: Y.Map<unknown>): WidgetView {
  return {
    id: w.get("id") as string,
    type: w.get("type") as WidgetType,
    x: w.get("x") as number,
    y: w.get("y") as number,
    w: w.get("w") as number,
    h: w.get("h") as number,
    z: (w.get("z") as number) ?? 0,
    title: w.get("title") as string,
    config: (w.get("config") as Record<string, unknown>) ?? {},
    createdBy: w.get("createdBy") as string,
  };
}

export function noteBody(shared: Shared, id: string): Y.Text | undefined {
  const w = shared.widgets.get(id);
  const body = w?.get("body");
  return body instanceof Y.Text ? body : undefined;
}

// ---- Drafts: per-user unsaved edits -------------------------------------

function draftKey(userId: string, widgetId: string): string {
  return `${userId}::${widgetId}`;
}

export function setDraftField(
  shared: Shared,
  userId: string,
  widgetId: string,
  field: string,
  value: unknown,
): void {
  const key = draftKey(userId, widgetId);
  shared.doc.transact(() => {
    let d = shared.drafts.get(key);
    if (!d) {
      d = new Y.Map<unknown>();
      d.set("widgetId", widgetId);
      d.set("updatedAt", Date.now());
      shared.drafts.set(key, d);
    }
    d.set(field, value);
    d.set("updatedAt", Date.now());
  }, userId);
}

export function getDraft(shared: Shared, userId: string, widgetId: string): Record<string, unknown> | null {
  const d = shared.drafts.get(draftKey(userId, widgetId));
  if (!d) return null;
  const out: Record<string, unknown> = {};
  d.forEach((v, k) => (out[k] = v));
  return out;
}

export function userDraftCount(shared: Shared, userId: string): number {
  let n = 0;
  shared.drafts.forEach((_d, key) => {
    if (key.startsWith(`${userId}::`)) n++;
  });
  return n;
}

export function commitDraft(shared: Shared, userId: string, widgetId: string): void {
  const key = draftKey(userId, widgetId);
  const d = shared.drafts.get(key);
  const w = shared.widgets.get(widgetId);
  if (!d || !w) return;
  shared.doc.transact(() => {
    const config = { ...((w.get("config") as Record<string, unknown>) ?? {}) };
    d.forEach((v, k) => {
      if (k === "widgetId" || k === "updatedAt") return;
      if (k === "title") w.set("title", v);
      else config[k] = v;
    });
    w.set("config", config);
    shared.drafts.delete(key);
  }, userId);
  pushLog(shared, {
    kind: "commit",
    actor: userId,
    message: `Saved changes to "${w.get("title") as string}"`,
  });
}

export function discardDraft(shared: Shared, userId: string, widgetId: string): void {
  shared.doc.transact(() => {
    shared.drafts.delete(draftKey(userId, widgetId));
  }, userId);
}

// ---- Activity / conflict log --------------------------------------------

export function pushLog(shared: Shared, entry: Omit<LogEntry, "id" | "ts">): void {
  const full: LogEntry = {
    id: `l_${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    ...entry,
  };
  shared.log.push([full]);
  // keep the log bounded
  if (shared.log.length > 200) shared.log.delete(0, shared.log.length - 200);
}

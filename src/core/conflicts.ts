import * as Y from "yjs";
import type { Shared } from "./doc";
import { pushLog } from "./model";

// Yjs resolves concurrent edits deterministically at the data-structure level —
// that is the whole point of a CRDT, and it is why no edit is ever rejected.
// What a user still wants to *see* is "someone else touched the same thing you
// were touching, and here is the merged result."
//
// This watcher detects exactly that case: a remote change to a field you edited
// within the last few seconds. It never blocks or discards anything; it reports
// the merge so the resolution is legible instead of silent.

const WINDOW_MS = 8000;

export class ConflictWatcher {
  private readonly shared: Shared;
  private readonly localUserId: string;
  private readonly recent = new Map<string, number>();

  constructor(shared: Shared, localUserId: string) {
    this.shared = shared;
    this.localUserId = localUserId;
    this.shared.widgets.observeDeep(this.onChange);
  }

  /** Call when the local user edits a field, so we can spot a later remote hit. */
  noteLocalEdit(widgetId: string, field: string): void {
    this.recent.set(`${widgetId}:${field}`, Date.now());
  }

  dispose(): void {
    this.shared.widgets.unobserveDeep(this.onChange);
  }

  private onChange = (events: Y.YEvent<any>[]): void => {
    for (const event of events) {
      const origin = event.transaction.origin;
      const isRemote = origin !== this.localUserId;
      if (!isRemote) continue;

      const widgetId = String(event.path[0] ?? (event.target as Y.Map<unknown>).get?.("id") ?? "");
      if (!widgetId) continue;
      const widget = this.shared.widgets.get(widgetId);
      const title = (widget?.get("title") as string) ?? "a widget";

      const fields =
        event instanceof Y.YMapEvent
          ? Array.from(event.keysChanged)
          : ["body"];

      for (const field of fields) {
        const stamp = this.recent.get(`${widgetId}:${field}`);
        if (stamp && Date.now() - stamp < WINDOW_MS) {
          this.recent.delete(`${widgetId}:${field}`);
          pushLog(this.shared, {
            kind: "merge",
            actor: String(origin),
            message: `Merged concurrent edits to "${field}" on "${title}"`,
          });
        }
      }
    }
  };
}

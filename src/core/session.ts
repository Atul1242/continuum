import * as Y from "yjs";
import type { Shared, WidgetType, WorkflowStep } from "./doc";
import type { Identity } from "./identity";

// Operational state: the things a normal app throws away on reload. Selection,
// the workflow step you were on, where the canvas was scrolled, which inspector
// tab was open, and any half-filled "add widget" form. We persist this per user
// into the shared document, so it travels with you to the next device and
// survives a crash.
//
// This is the difference between *restoring data* and *resuming work*.

export interface SessionSnapshot {
  selectedWidgetId: string | null;
  workflowStep: WorkflowStep;
  scrollX: number;
  scrollY: number;
  inspectorTab: string;
  composer: { type: WidgetType; title: string } | null;
  lastDeviceId: string;
  lastDeviceLabel: string;
  updatedAt: number;
}

const DEFAULT_SNAPSHOT: SessionSnapshot = {
  selectedWidgetId: null,
  workflowStep: "Layout",
  scrollX: 0,
  scrollY: 0,
  inspectorTab: "edit",
  composer: null,
  lastDeviceId: "",
  lastDeviceLabel: "",
  updatedAt: 0,
};

export class SessionController {
  private readonly shared: Shared;
  private readonly identity: Identity;
  private readonly map: Y.Map<unknown>;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: Partial<SessionSnapshot> = {};

  constructor(shared: Shared, identity: Identity) {
    this.shared = shared;
    this.identity = identity;
    let map = shared.sessions.get(identity.userId);
    if (!map) {
      map = new Y.Map<unknown>();
      shared.sessions.set(identity.userId, map);
    }
    this.map = map;
  }

  /** The state as it was last written — possibly by another device. */
  read(): SessionSnapshot {
    const out = { ...DEFAULT_SNAPSHOT };
    this.map.forEach((v, k) => {
      (out as Record<string, unknown>)[k] = v;
    });
    return out;
  }

  /**
   * Was the last write made somewhere other than this tab? If so, the user is
   * arriving on a new device (or after a crash) and we should offer to resume
   * rather than silently snap the UI around.
   */
  isForeignSession(): boolean {
    const snap = this.read();
    return snap.updatedAt > 0 && snap.lastDeviceId !== this.identity.deviceId;
  }

  patch(part: Partial<SessionSnapshot>): void {
    Object.assign(this.pending, part);
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => this.flush(), 350);
  }

  /** Mark this device as the one currently holding the session. */
  claim(): void {
    this.patch({});
    this.flush();
  }

  private flush(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    const part = this.pending;
    this.pending = {};
    this.shared.doc.transact(() => {
      for (const [k, v] of Object.entries(part)) this.map.set(k, v);
      this.map.set("lastDeviceId", this.identity.deviceId);
      this.map.set("lastDeviceLabel", this.identity.deviceLabel);
      this.map.set("updatedAt", Date.now());
    }, this.identity.userId);
  }
}

import "./styles.css";
import { Awareness } from "y-protocols/awareness";

import { createShared, type WidgetType, type WorkflowStep } from "./core/doc";
import { resolveIdentity, workspaceId } from "./core/identity";
import { attachLocalStore } from "./core/persistence";
import { SyncProvider } from "./core/provider";
import { SessionController } from "./core/session";
import { ConflictWatcher } from "./core/conflicts";
import {
  addWidget,
  moveWidget,
  resizeWidget,
  removeWidget,
  commitDraft,
  discardDraft,
  setDraftField,
  userDraftCount,
  pushLog,
} from "./core/model";
import { toast } from "./ui/dom";

import type { AppContext, UIState } from "./ui/context";
import { renderPalette } from "./ui/palette";
import { renderCanvas } from "./ui/canvas";
import { renderInspector } from "./ui/inspector";
import { renderTopbar, renderStatusbar, renderActivity, showResumeBanner } from "./ui/chrome";
import { trackCursor, renderPresence } from "./ui/presence";

async function boot(): Promise<void> {
  const identity = resolveIdentity();
  const workspace = workspaceId();
  const shared = createShared();

  // Wait for local state before deciding what to do — the whole point is that a
  // cold start with no network still knows where you were.
  const local = attachLocalStore(shared, workspace);
  await local.whenReady;

  const session = new SessionController(shared, identity);
  const snapshot = session.read();
  const arrivingElsewhere = session.isForeignSession();
  const hadUnsaved = userDraftCount(shared, identity.userId) > 0;

  const awareness = new Awareness(shared.doc);
  awareness.setLocalStateField("user", {
    name: identity.name,
    color: identity.color,
    deviceLabel: identity.deviceLabel,
    userId: identity.userId,
  });

  const proto = location.protocol === "https:" ? "wss" : "ws";
  const token = new URL(location.href).searchParams.get("token");
  const base = `${proto}://${location.hostname}:${__API_PORT__}/sync/${encodeURIComponent(workspace)}`;
  const url = token ? `${base}?token=${encodeURIComponent(token)}` : base;
  const provider = new SyncProvider(url, shared.doc, awareness);
  const conflicts = new ConflictWatcher(shared, identity.userId);

  const ui: UIState = {
    selectedId: snapshot.selectedWidgetId,
    workflowStep: snapshot.workflowStep,
    inspectorTab: snapshot.inspectorTab === "data" ? "data" : "edit",
    composer: null,
    showActivity: false,
    draggingId: null,
  };

  const renderAll = (): void => {
    renderTopbar(app);
    renderPalette(app);
    renderCanvas(app);
    renderInspector(app);
    renderStatusbar(app);
    renderActivity(app);
    renderPresence(app);
  };

  const app: AppContext = {
    shared,
    identity,
    provider,
    session,
    conflicts,
    ui,

    select(id) {
      ui.selectedId = id;
      session.patch({ selectedWidgetId: id });
      renderCanvas(app);
      renderInspector(app);
    },
    setWorkflow(step: WorkflowStep) {
      ui.workflowStep = step;
      session.patch({ workflowStep: step });
      renderTopbar(app);
    },
    setInspectorTab(tab) {
      ui.inspectorTab = tab;
      session.patch({ inspectorTab: tab });
      renderInspector(app);
    },

    openComposer(type: WidgetType) {
      ui.composer = { type, title: "" };
      session.patch({ composer: ui.composer });
      renderPalette(app);
    },
    updateComposer(part) {
      if (!ui.composer) return;
      ui.composer = { ...ui.composer, ...part };
      session.patch({ composer: ui.composer });
    },
    commitComposer() {
      if (!ui.composer) return;
      const { type, title } = ui.composer;
      const id = addWidget(shared, type, identity.userId, { x: 0, y: nextRow(shared) });
      if (title.trim()) {
        shared.doc.transact(() => shared.widgets.get(id)?.set("title", title.trim()), identity.userId);
      }
      ui.composer = null;
      session.patch({ composer: null });
      app.select(id);
      renderPalette(app);
    },
    cancelComposer() {
      ui.composer = null;
      session.patch({ composer: null });
      renderPalette(app);
    },

    editDraft(widgetId, field, value) {
      setDraftField(shared, identity.userId, widgetId, field, value);
      conflicts.noteLocalEdit(widgetId, field === "title" ? "title" : "config");
      renderCanvas(app);
      renderStatusbar(app);
    },
    saveWidget(widgetId) {
      commitDraft(shared, identity.userId, widgetId);
      renderCanvas(app);
      renderInspector(app);
      renderStatusbar(app);
    },
    discardWidget(widgetId) {
      discardDraft(shared, identity.userId, widgetId);
      renderCanvas(app);
      renderInspector(app);
      renderStatusbar(app);
    },
    deleteWidget(widgetId) {
      removeWidget(shared, widgetId, identity.userId);
      if (ui.selectedId === widgetId) ui.selectedId = null;
      renderCanvas(app);
      renderInspector(app);
    },
    moveWidgetTo(widgetId, x, y) {
      moveWidget(shared, widgetId, x, y, identity.userId);
    },
    resizeWidgetTo(widgetId, w, h) {
      resizeWidget(shared, widgetId, w, h, identity.userId);
    },
    renameWorkspace(name) {
      const clean = name.trim().slice(0, 80) || "Untitled dashboard";
      shared.doc.transact(() => shared.meta.set("name", clean), identity.userId);
    },
    copyShareLink() {
      const link = `${location.origin}/?user=${encodeURIComponent(identity.userId)}&room=${encodeURIComponent(workspace)}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(link).then(
          () => toast("Link copied — open it on another device to resume here"),
          () => toast(link),
        );
      } else {
        toast(link);
      }
    },

    toggleOffline() {
      if (provider.status === "offline") {
        provider.connect();
        pushLog(shared, { kind: "online", actor: identity.userId, message: `${identity.deviceLabel} is back online` });
      } else {
        provider.goOffline();
        pushLog(shared, { kind: "offline", actor: identity.userId, message: `${identity.deviceLabel} went offline — edits are kept locally` });
      }
      renderStatusbar(app);
    },
    toggleActivity() {
      ui.showActivity = !ui.showActivity;
      renderActivity(app);
      renderStatusbar(app);
    },

    renderAll,
  };

  wireObservers(app, awareness);
  trackCursor(app);
  renderAll();
  requestAnimationFrame(() => document.body.classList.add("loaded"));

  // Persist scroll position so "UI position" is reconstructed exactly.
  document.getElementById("canvas-wrap")?.addEventListener("scroll", (e) => {
    const t = e.target as HTMLElement;
    session.patch({ scrollX: t.scrollLeft, scrollY: t.scrollTop });
  });

  keyboardShortcuts(app);

  // Decide whether to offer a resume, or just take over the session silently.
  if (snapshot.updatedAt > 0 && (arrivingElsewhere || hadUnsaved)) {
    showResumeBanner(app, snapshot);
  } else {
    session.claim();
  }

  pushLog(shared, { kind: "join", actor: identity.userId, message: `${identity.name} joined on ${identity.deviceLabel}` });

  // Seed a starter dashboard the first time this workspace is ever opened.
  setTimeout(() => seedIfEmpty(app), 700);
}

function wireObservers(app: AppContext, awareness: Awareness): void {
  const { shared, identity } = app;

  shared.widgets.observeDeep((events) => {
    renderCanvas(app);
    if (events.some((e) => e.transaction.origin !== identity.userId)) renderInspector(app);
  });
  shared.drafts.observeDeep((events) => {
    renderCanvas(app);
    renderStatusbar(app);
    if (events.some((e) => e.transaction.origin !== identity.userId)) renderInspector(app);
  });
  shared.log.observe(() => renderActivity(app));
  shared.meta.observe(() => renderTopbar(app));

  app.provider.onStatus(() => renderStatusbar(app));
  awareness.on("change", () => {
    renderPresence(app);
    renderTopbar(app);
  });
}

function keyboardShortcuts(app: AppContext): void {
  window.addEventListener("keydown", (e) => {
    const typing = (e.target as HTMLElement)?.closest("input,textarea,select");
    if (typing) {
      if (e.key === "Escape") (e.target as HTMLElement).blur();
      return;
    }
    if (e.key === "Escape") {
      if (app.ui.composer) app.cancelComposer();
      else app.select(null);
    }
    if ((e.key === "Delete" || e.key === "Backspace") && app.ui.selectedId) {
      app.deleteWidget(app.ui.selectedId);
    }
  });
}

function nextRow(shared: ReturnType<typeof createShared>): number {
  let bottom = 0;
  shared.widgets.forEach((w) => {
    bottom = Math.max(bottom, (w.get("y") as number) + (w.get("h") as number));
  });
  return bottom;
}

function seedIfEmpty(app: AppContext): void {
  const { shared, identity } = app;
  if (shared.widgets.size > 0 || shared.meta.get("seeded")) return;
  shared.doc.transact(() => {
    shared.meta.set("name", "Payments — Live operations");
    shared.meta.set("seeded", true);
  }, identity.userId);

  const place = (id: string, x: number, y: number, patch: Record<string, unknown>, title: string): void => {
    const w = shared.widgets.get(id);
    if (!w) return;
    shared.doc.transact(() => {
      w.set("x", x);
      w.set("y", y);
      w.set("title", title);
      const cfg = { ...((w.get("config") as Record<string, unknown>) ?? {}), ...patch };
      w.set("config", cfg);
    }, identity.userId);
  };

  place(addWidget(shared, "metric", identity.userId), 0, 0,
    { value: "1,284", unit: "/min", trend: 4, accent: "#6ee7ff" }, "Transactions / min");
  place(addWidget(shared, "metric", identity.userId), 3, 0,
    { value: "37", unit: "", trend: -12, accent: "#fca5a5" }, "Failed (last hour)");
  place(addWidget(shared, "status", identity.userId), 6, 0,
    { state: "warn", label: "Gateway degraded" }, "Payment gateway");
  place(addWidget(shared, "chart", identity.userId), 0, 2,
    { series: [9, 11, 8, 14, 10, 18, 22, 16], kind: "line" }, "Failure rate — 24h");
  place(addWidget(shared, "note", identity.userId), 5, 2, {}, "Incident notes");
  app.renderAll();
}

boot().catch((err) => {
  console.error("[continuum] failed to start:", err);
  document.body.append(
    Object.assign(document.createElement("pre"), {
      textContent: `Continuum failed to start: ${String(err)}`,
      style: "color:#fca5a5;padding:24px;font-family:monospace",
    }),
  );
});

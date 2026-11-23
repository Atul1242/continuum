import type { AppContext } from "./context";
import { WORKFLOW_STEPS } from "../core/doc";
import { userDraftCount } from "../core/model";
import { renderPeers } from "./presence";
import { el, timeAgo } from "./dom";
import type { SessionSnapshot } from "../core/session";

export function renderTopbar(app: AppContext): void {
  const root = document.getElementById("topbar");
  if (!root) return;
  const name = (app.shared.meta.get("name") as string) ?? "Operations dashboard";

  const steps = el(
    "div",
    { class: "stepper" },
    WORKFLOW_STEPS.map((step) =>
      el("button", {
        class: `step${app.ui.workflowStep === step ? " active" : ""}`,
        onClick: () => app.setWorkflow(step),
      }, [step]),
    ),
  );

  root.replaceChildren(
    el("div", { class: "brand" }, [
      el("span", { class: "brand-mark" }),
      el("div", { class: "brand-text" }, [
        el("span", { class: "brand-name" }, ["Continuum"]),
        el("span", { class: "brand-doc" }, [name]),
      ]),
    ]),
    steps,
    renderPeers(app),
  );
}

export function renderStatusbar(app: AppContext): void {
  const root = document.getElementById("statusbar");
  if (!root) return;

  const status = app.provider.status;
  const unsaved = userDraftCount(app.shared, app.identity.userId);
  const offline = status === "offline";

  const left = el("div", { class: "status-left" }, [
    el("span", { class: `conn ${status}` }, [
      el("span", { class: "conn-dot" }),
      status === "online" ? "Synced" : status === "connecting" ? "Reconnecting…" : "Offline",
    ]),
    el("span", { class: "status-device" }, [`${app.identity.name} · ${app.identity.deviceLabel}`]),
    unsaved
      ? el("span", { class: "status-unsaved" }, [`${unsaved} unsaved`])
      : el("span", { class: "status-saved" }, ["All changes saved"]),
  ]);

  const right = el("div", { class: "status-right" }, [
    el("button", {
      class: `btn ${offline ? "primary" : "ghost"}`,
      onClick: () => app.toggleOffline(),
    }, [offline ? "Come back online" : "Simulate offline"]),
    el("button", {
      class: `btn ghost${app.ui.showActivity ? " active" : ""}`,
      onClick: () => app.toggleActivity(),
    }, ["Activity"]),
  ]);

  root.replaceChildren(left, right);
}

export function renderActivity(app: AppContext): void {
  const existing = document.getElementById("activity");
  if (!app.ui.showActivity) {
    existing?.remove();
    return;
  }
  const items = app.shared.log.toArray().slice(-60).reverse();
  const list = items.length
    ? items.map((e) =>
        el("div", { class: `log-row ${e.kind}` }, [
          el("span", { class: "log-kind" }, [e.kind]),
          el("span", { class: "log-msg" }, [e.message]),
          el("span", { class: "log-time" }, [timeAgo(e.ts)]),
        ]),
      )
    : [el("div", { class: "log-empty" }, ["No activity yet."])];

  const panel = el("aside", { id: "activity" }, [
    el("div", { class: "activity-head" }, [
      el("span", {}, ["Activity & merges"]),
      el("button", { class: "icon-btn", onClick: () => app.toggleActivity() }, ["✕"]),
    ]),
    el("div", { class: "activity-list" }, list),
  ]);

  const prev = document.getElementById("activity");
  if (prev) prev.replaceWith(panel);
  else document.body.append(panel);
}

export function showResumeBanner(app: AppContext, snap: SessionSnapshot): void {
  const wrap = document.getElementById("canvas-wrap");
  if (!wrap) return;

  const unsaved = userDraftCount(app.shared, app.identity.userId);
  const editing =
    snap.selectedWidgetId && app.shared.widgets.has(snap.selectedWidgetId)
      ? (app.shared.widgets.get(snap.selectedWidgetId)!.get("title") as string)
      : null;

  const bits: string[] = [`on the ${snap.workflowStep} step`];
  if (editing) bits.push(`editing “${editing}”`);
  if (unsaved) bits.push(`${unsaved} unsaved change${unsaved > 1 ? "s" : ""}`);
  if (snap.composer) bits.push(`a half-finished ${snap.composer.type}`);

  const banner = el("div", { id: "resume" }, [
    el("div", { class: "resume-body" }, [
      el("div", { class: "resume-title" }, ["Welcome back — pick up where you left off"]),
      el("div", { class: "resume-detail" }, [
        `You were ${bits.join(", ")}. Last active on ${snap.lastDeviceLabel || "another device"} ${timeAgo(snap.updatedAt)}.`,
      ]),
    ]),
    el("div", { class: "resume-actions" }, [
      el("button", { class: "btn primary", onClick: () => resume(app, snap, banner) }, ["Resume"]),
      el("button", { class: "btn ghost", onClick: () => dismiss(app, banner) }, ["Not now"]),
    ]),
  ]);

  const prev = document.getElementById("resume");
  if (prev) prev.replaceWith(banner);
  else wrap.prepend(banner);
}

function resume(app: AppContext, snap: SessionSnapshot, banner: HTMLElement): void {
  app.setWorkflow(snap.workflowStep);
  app.setInspectorTab(snap.inspectorTab === "data" ? "data" : "edit");
  if (snap.selectedWidgetId && app.shared.widgets.has(snap.selectedWidgetId)) {
    app.select(snap.selectedWidgetId);
  }
  if (snap.composer) {
    app.openComposer(snap.composer.type);
    app.updateComposer({ title: snap.composer.title });
  }
  const wrap = document.getElementById("canvas-wrap");
  wrap?.scrollTo({ left: snap.scrollX, top: snap.scrollY, behavior: "smooth" });
  banner.remove();
  app.session.claim();
}

function dismiss(app: AppContext, banner: HTMLElement): void {
  banner.remove();
  app.session.claim();
}

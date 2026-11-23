import type { AppContext } from "./context";
import { readWidget } from "../core/model";
import { renderWidgetBody } from "./widget";
import { el } from "./dom";

export const CELL_W = 96;
export const CELL_H = 72;
export const GAP = 12;

// The dashboard surface. Widgets are absolutely positioned on a fixed grid so a
// coordinate means the same thing on every device — part of reconstructing "UI
// position" faithfully rather than approximately.

export function renderCanvas(app: AppContext): void {
  const canvas = document.getElementById("canvas");
  if (!canvas) return;
  if (app.ui.draggingId) return; // never rebuild mid-drag

  const nodes: HTMLElement[] = [];
  const ids = Array.from(app.shared.widgets.keys());

  if (ids.length === 0) {
    nodes.push(
      el("div", { class: "empty" }, [
        el("div", { class: "empty-title" }, ["Nothing here yet"]),
        el("div", { class: "empty-sub" }, [
          "Add a widget from the left. Then switch devices or pull the plug — your place is kept.",
        ]),
      ]),
    );
  }

  for (const id of ids) {
    const ymap = app.shared.widgets.get(id);
    if (!ymap) continue;
    const view = readWidget(ymap);
    const hasDraft = app.shared.drafts.has(`${app.identity.userId}::${id}`);
    const selected = app.ui.selectedId === id;

    const node = el("div", {
      class: `widget${selected ? " selected" : ""}${hasDraft ? " dirty" : ""}`,
      style: `left:${view.x * CELL_W}px;top:${view.y * CELL_H}px;width:${view.w * CELL_W - GAP}px;height:${view.h * CELL_H - GAP}px;z-index:${view.z}`,
      "data-id": id,
    }, [
      el("div", { class: "widget-head" }, [
        el("span", { class: "widget-title" }, [view.title]),
        hasDraft ? el("span", { class: "badge" }, ["unsaved"]) : el("span", {}),
      ]),
      el("div", { class: "widget-body" }, [renderWidgetBody(view, app.shared)]),
    ]);

    attachDrag(app, node, view.x, view.y);
    nodes.push(node);
  }

  canvas.replaceChildren(...nodes);
}

function attachDrag(app: AppContext, node: HTMLElement, startGX: number, startGY: number): void {
  node.addEventListener("pointerdown", (ev) => {
    const target = ev.target as HTMLElement;
    if (target.closest("input,textarea,button")) return;
    const id = node.dataset.id!;
    app.select(id);

    const originX = ev.clientX;
    const originY = ev.clientY;
    let moved = false;
    app.ui.draggingId = id;
    node.classList.add("dragging");
    node.setPointerCapture(ev.pointerId);

    const onMove = (e: PointerEvent): void => {
      const dx = e.clientX - originX;
      const dy = e.clientY - originY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      node.style.left = `${startGX * CELL_W + dx}px`;
      node.style.top = `${startGY * CELL_H + dy}px`;
    };

    const onUp = (e: PointerEvent): void => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onUp);
      node.classList.remove("dragging");
      app.ui.draggingId = null;
      if (moved) {
        const dx = e.clientX - originX;
        const dy = e.clientY - originY;
        const gx = Math.max(0, Math.round((startGX * CELL_W + dx) / CELL_W));
        const gy = Math.max(0, Math.round((startGY * CELL_H + dy) / CELL_H));
        app.moveWidgetTo(id, gx, gy);
      }
    };

    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", onUp);
  });
}

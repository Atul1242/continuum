import type { AppContext } from "./context";
import type { WidgetType } from "../core/doc";
import { el } from "./dom";

const TYPES: { type: WidgetType; label: string; hint: string }[] = [
  { type: "metric", label: "Metric", hint: "A single number" },
  { type: "chart", label: "Chart", hint: "Bar or line series" },
  { type: "table", label: "Table", hint: "Rows and columns" },
  { type: "status", label: "Status", hint: "Service health" },
  { type: "note", label: "Note", hint: "Live shared text" },
];

export function renderPalette(app: AppContext): void {
  const root = document.getElementById("palette");
  if (!root) return;

  const buttons = TYPES.map((t) =>
    el("button", { class: "palette-item", onClick: () => app.openComposer(t.type) }, [
      el("span", { class: `swatch ${t.type}` }),
      el("span", { class: "palette-text" }, [
        el("span", { class: "palette-label" }, [t.label]),
        el("span", { class: "palette-hint" }, [t.hint]),
      ]),
    ]),
  );

  const children: HTMLElement[] = [
    el("div", { class: "panel-title" }, ["Add widget"]),
    el("div", { class: "palette-list" }, buttons),
  ];

  if (app.ui.composer) {
    children.push(renderComposer(app));
  }

  root.replaceChildren(...children);
}

function renderComposer(app: AppContext): HTMLElement {
  const composer = app.ui.composer!;
  const input = el("input", {
    class: "field-input",
    type: "text",
    placeholder: "Title",
    value: composer.title,
    onInput: (e: Event) => app.updateComposer({ title: (e.target as HTMLInputElement).value }),
  });
  // Let Enter confirm.
  input.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") app.commitComposer();
  });

  return el("div", { class: "composer" }, [
    el("div", { class: "composer-head" }, [`New ${composer.type}`]),
    input,
    el("div", { class: "composer-actions" }, [
      el("button", { class: "btn primary", onClick: () => app.commitComposer() }, ["Add to canvas"]),
      el("button", { class: "btn ghost", onClick: () => app.cancelComposer() }, ["Cancel"]),
    ]),
    el("div", { class: "composer-note" }, [
      "Half-finished? This stays with you — switch devices and it's still here.",
    ]),
  ]);
}

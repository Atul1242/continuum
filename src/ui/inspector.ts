import type { AppContext } from "./context";
import { readWidget, getDraft, noteBody } from "../core/model";
import { el } from "./dom";
import { bindTextarea } from "./bindText";

// The right-hand editor. Field edits are staged as a *draft* (unsaved) so they
// survive a device switch before you commit them. The one exception is the Note
// body, which is a live CRDT text that merges keystrokes across devices in real
// time — a deliberate contrast between "staged work" and "shared work".

let activeUnbind: (() => void) | null = null;

export function renderInspector(app: AppContext): void {
  const root = document.getElementById("inspector");
  if (!root) return;
  activeUnbind?.();
  activeUnbind = null;

  const id = app.ui.selectedId;
  if (!id || !app.shared.widgets.has(id)) {
    root.replaceChildren(
      el("div", { class: "panel-title" }, ["Inspector"]),
      el("div", { class: "inspector-empty" }, ["Select a widget to edit it."]),
    );
    return;
  }

  const view = readWidget(app.shared.widgets.get(id)!);
  const draft = getDraft(app.shared, app.identity.userId, id) ?? {};
  const val = (field: string): string =>
    String(draft[field] ?? view.config[field] ?? "");
  const title = String(draft["title"] ?? view.title);
  const dirty = Object.keys(draft).some((k) => k !== "widgetId" && k !== "updatedAt");

  const tabs = el("div", { class: "tabs" }, [
    tab(app, "edit", "Edit"),
    tab(app, "data", "Data"),
  ]);

  const body =
    app.ui.inspectorTab === "data"
      ? dataTab(view)
      : editTab(app, id, view.type, title, val);

  const children: HTMLElement[] = [
    el("div", { class: "panel-title" }, ["Inspector"]),
    tabs,
    body,
  ];

  if (app.ui.inspectorTab === "edit") {
    children.push(
      el("div", { class: "inspector-actions" }, [
        el("button", {
          class: `btn primary${dirty ? "" : " disabled"}`,
          onClick: () => dirty && app.saveWidget(id),
        }, ["Save"]),
        el("button", {
          class: `btn ghost${dirty ? "" : " disabled"}`,
          onClick: () => dirty && app.discardWidget(id),
        }, ["Discard"]),
        el("button", { class: "btn danger", onClick: () => app.deleteWidget(id) }, ["Delete"]),
      ]),
    );
    if (dirty) {
      children.push(el("div", { class: "dirty-hint" }, ["Unsaved — synced to your other devices."]));
    }
  }

  root.replaceChildren(...children);
}

function tab(app: AppContext, key: "edit" | "data", label: string): HTMLElement {
  return el("button", {
    class: `tab${app.ui.inspectorTab === key ? " active" : ""}`,
    onClick: () => app.setInspectorTab(key),
  }, [label]);
}

function editTab(
  app: AppContext,
  id: string,
  type: string,
  title: string,
  val: (f: string) => string,
): HTMLElement {
  const fields: HTMLElement[] = [
    textField(app, id, "title", "Title", title),
  ];

  if (type === "metric") {
    fields.push(
      textField(app, id, "value", "Value", val("value")),
      textField(app, id, "unit", "Unit", val("unit")),
      numberField(app, id, "trend", "Trend %", val("trend")),
      colorField(app, id, "accent", "Accent", val("accent") || "#6ee7ff"),
    );
  } else if (type === "chart") {
    fields.push(
      selectField(app, id, "kind", "Style", val("kind") || "bar", ["bar", "line"]),
      colorField(app, id, "accent", "Accent", val("accent") || "#a78bfa"),
    );
  } else if (type === "table") {
    fields.push(areaField(app, id, "rows", "Rows (comma-separated)", val("rows")));
  } else if (type === "status") {
    fields.push(
      selectField(app, id, "state", "State", val("state") || "ok", ["ok", "warn", "down"]),
      textField(app, id, "label", "Label", val("label")),
    );
  } else if (type === "note") {
    fields.push(colorField(app, id, "accent", "Accent", val("accent") || "#fcd34d"));
    fields.push(noteField(app, id));
  }

  return el("div", { class: "fields" }, fields);
}

function dataTab(view: ReturnType<typeof readWidget>): HTMLElement {
  const rows: [string, string][] = [
    ["id", view.id],
    ["type", view.type],
    ["position", `${view.x}, ${view.y}`],
    ["size", `${view.w} × ${view.h}`],
    ["created by", view.createdBy],
  ];
  return el("div", { class: "fields" }, [
    ...rows.map(([k, v]) =>
      el("div", { class: "kv" }, [el("span", { class: "k" }, [k]), el("span", { class: "v" }, [v])]),
    ),
    el("pre", { class: "json" }, [JSON.stringify(view.config, null, 2)]),
  ]);
}

// --- field builders --------------------------------------------------------

function wrap(label: string, control: HTMLElement): HTMLElement {
  return el("label", { class: "field" }, [el("span", { class: "field-label" }, [label]), control]);
}

function textField(app: AppContext, id: string, field: string, label: string, value: string): HTMLElement {
  const input = el("input", {
    class: "field-input",
    type: "text",
    value,
    onInput: (e: Event) => app.editDraft(id, field, (e.target as HTMLInputElement).value),
  });
  return wrap(label, input);
}

function numberField(app: AppContext, id: string, field: string, label: string, value: string): HTMLElement {
  const input = el("input", {
    class: "field-input",
    type: "number",
    value,
    onInput: (e: Event) => app.editDraft(id, field, Number((e.target as HTMLInputElement).value)),
  });
  return wrap(label, input);
}

function colorField(app: AppContext, id: string, field: string, label: string, value: string): HTMLElement {
  const input = el("input", {
    class: "field-color",
    type: "color",
    value,
    onInput: (e: Event) => app.editDraft(id, field, (e.target as HTMLInputElement).value),
  });
  return wrap(label, input);
}

function selectField(
  app: AppContext,
  id: string,
  field: string,
  label: string,
  value: string,
  options: string[],
): HTMLElement {
  const select = el("select", {
    class: "field-input",
    onChange: (e: Event) => app.editDraft(id, field, (e.target as HTMLSelectElement).value),
  });
  for (const opt of options) {
    const o = el("option", { value: opt }, [opt]);
    if (opt === value) o.setAttribute("selected", "");
    select.append(o);
  }
  return wrap(label, select);
}

function areaField(app: AppContext, id: string, field: string, label: string, value: string): HTMLElement {
  const area = el("textarea", {
    class: "field-area",
    rows: 4,
    onInput: (e: Event) => app.editDraft(id, field, (e.target as HTMLTextAreaElement).value),
  }, [value]);
  return wrap(label, area);
}

function noteField(app: AppContext, id: string): HTMLElement {
  const text = noteBody(app.shared, id);
  const area = el("textarea", { class: "field-area live", rows: 6 }) as HTMLTextAreaElement;
  if (text) {
    activeUnbind = bindTextarea(text, area, app.identity.userId);
    area.addEventListener("input", () => app.conflicts.noteLocalEdit(id, "body"));
  }
  return wrap("Body (live, merges across devices)", area);
}

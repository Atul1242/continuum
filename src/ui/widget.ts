import type { Shared } from "../core/doc";
import { noteBody, type WidgetView } from "../core/model";
import { el } from "./dom";

// Renders the *content* of a widget (not its frame). Kept pure and switch-based
// so adding a widget type is a single, obvious change.

export function renderWidgetBody(view: WidgetView, shared: Shared): HTMLElement {
  switch (view.type) {
    case "metric":
      return metric(view);
    case "chart":
      return chart(view);
    case "table":
      return table(view);
    case "status":
      return status(view);
    case "note":
      return note(view, shared);
  }
}

function metric(view: WidgetView): HTMLElement {
  const value = String(view.config.value ?? "0");
  const unit = String(view.config.unit ?? "");
  const trend = Number(view.config.trend ?? 0);
  const trendEl = trend
    ? el("span", { class: `trend ${trend > 0 ? "up" : "down"}` }, [
        `${trend > 0 ? "+" : "−"}${Math.abs(trend)}%`,
      ])
    : el("span", {});
  return el("div", { class: "w-metric" }, [
    el("div", { class: "w-metric-value" }, [
      value,
      el("span", { class: "w-metric-unit" }, [unit]),
    ]),
    trendEl,
  ]);
}

function chart(view: WidgetView): HTMLElement {
  const series = (view.config.series as number[]) ?? [];
  const accent = String(view.config.accent ?? "#a78bfa");
  const kind = String(view.config.kind ?? "bar");
  const max = Math.max(1, ...series);
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 100 44");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.classList.add("w-chart");

  if (kind === "line") {
    const step = series.length > 1 ? 100 / (series.length - 1) : 100;
    const pts = series.map((v, i) => `${i * step},${44 - (v / max) * 40 - 2}`).join(" ");
    const poly = document.createElementNS(svgNS, "polyline");
    poly.setAttribute("points", pts);
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", accent);
    poly.setAttribute("stroke-width", "2");
    poly.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(poly);
  } else {
    const bw = 100 / (series.length * 1.5);
    series.forEach((v, i) => {
      const h = (v / max) * 40;
      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", String(i * bw * 1.5 + bw * 0.25));
      rect.setAttribute("y", String(44 - h - 2));
      rect.setAttribute("width", String(bw));
      rect.setAttribute("height", String(h));
      rect.setAttribute("rx", "1");
      rect.setAttribute("fill", accent);
      svg.append(rect);
    });
  }
  return el("div", { class: "w-chart-wrap" }, [svg]);
}

function table(view: WidgetView): HTMLElement {
  const raw = String(view.config.rows ?? "");
  const rows = raw.split("\n").filter((r) => r.trim().length);
  const tbl = el("table", { class: "w-table" });
  rows.forEach((line, i) => {
    const cells = line.split(",").map((c) => c.trim());
    const tr = el("tr");
    cells.forEach((c) => {
      const isNum = i > 0 && /^[-+]?[\d.,%$€]+$/.test(c);
      tr.append(el(i === 0 ? "th" : "td", isNum ? { class: "num" } : {}, [c]));
    });
    tbl.append(tr);
  });
  return tbl;
}

function status(view: WidgetView): HTMLElement {
  const state = String(view.config.state ?? "ok");
  const label = String(view.config.label ?? "");
  return el("div", { class: "w-status" }, [
    el("span", { class: `dot ${state}` }),
    el("span", { class: "w-status-label" }, [label]),
  ]);
}

function note(view: WidgetView, shared: Shared): HTMLElement {
  const body = noteBody(shared, view.id)?.toString() ?? "";
  return el("div", { class: "w-note" }, [body || "Empty note"]);
}

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
  const kind = String(view.config.kind ?? "bar");
  const max = Math.max(1, ...series);
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 100 44");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.classList.add("w-chart");

  // A quiet baseline grounds the series.
  const axis = document.createElementNS(svgNS, "line");
  axis.setAttribute("x1", "0");
  axis.setAttribute("y1", "43");
  axis.setAttribute("x2", "100");
  axis.setAttribute("y2", "43");
  axis.setAttribute("class", "axis");
  axis.setAttribute("vector-effect", "non-scaling-stroke");
  svg.append(axis);

  // Colour comes from CSS (the single theme accent), so every chart stays in
  // step with the interface instead of each one carrying its own hue.
  if (kind === "line") {
    const step = series.length > 1 ? 100 / (series.length - 1) : 100;
    const coords = series.map((v, i) => [i * step, 44 - (v / max) * 38 - 3] as const);
    const pts = coords.map(([x, y]) => `${x} ${y}`).join(" ");
    const area = document.createElementNS(svgNS, "polygon");
    area.setAttribute("points", `0 44 ${pts} 100 44`);
    area.setAttribute("class", "area");
    const line = document.createElementNS(svgNS, "polyline");
    line.setAttribute("points", pts);
    line.setAttribute("class", "line");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(area, line);
    // Invisible hit targets give each point a native value tooltip on hover.
    coords.forEach(([x, y], i) => {
      const hit = document.createElementNS(svgNS, "circle");
      hit.setAttribute("cx", String(x));
      hit.setAttribute("cy", String(y));
      hit.setAttribute("r", "3");
      hit.setAttribute("class", "hit");
      const title = document.createElementNS(svgNS, "title");
      title.textContent = String(series[i] ?? "");
      hit.append(title);
      svg.append(hit);
    });
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
      rect.setAttribute("class", "bar");
      const title = document.createElementNS(svgNS, "title");
      title.textContent = String(v);
      rect.append(title);
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

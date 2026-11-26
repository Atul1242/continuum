import type { WidgetType } from "../core/doc";

// A small, consistent line-icon set — one per widget type — drawn on a 24px
// grid with a 1.8 stroke. Icons take the colour of their text role via
// `currentColor`, so they stay quiet and never introduce a second accent.

const PATHS: Record<WidgetType, string[]> = {
  metric: ["M9 4v16", "M15 4v16", "M4 9h16", "M4 15h16"],
  chart: ["M4 20h16", "M4 20V4", "M7 15l4-4 3 2 5-6"],
  table: ["M4 5h16v14H4z", "M4 10h16", "M10 5v14"],
  status: ["M3 12h4l2-6 4 12 2-6h6"],
  note: ["M5 7h14", "M5 11h14", "M5 15h9"],
};

export function typeIcon(type: WidgetType, size = 16): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("ic");
  for (const d of PATHS[type]) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

import type { AppContext } from "./context";
import { el, initials } from "./dom";

// Live presence: who else is in this workspace and where their pointer is.
// Driven entirely by Yjs awareness, which is ephemeral — it is never persisted
// and disappears the moment a peer disconnects.

interface PeerState {
  user?: { name: string; color: string; deviceLabel: string; userId: string };
  cursor?: { x: number; y: number };
}

export function trackCursor(app: AppContext): void {
  const wrap = document.getElementById("canvas-wrap");
  if (!wrap) return;
  let last = 0;
  wrap.addEventListener("pointermove", (ev) => {
    const now = performance.now();
    if (now - last < 40) return;
    last = now;
    const rect = wrap.getBoundingClientRect();
    app.provider.awareness.setLocalStateField("cursor", {
      x: Math.round(ev.clientX - rect.left + wrap.scrollLeft),
      y: Math.round(ev.clientY - rect.top + wrap.scrollTop),
    });
  });
  wrap.addEventListener("pointerleave", () => {
    app.provider.awareness.setLocalStateField("cursor", null);
  });
}

export function renderPresence(app: AppContext): void {
  const wrap = document.getElementById("canvas-wrap");
  if (!wrap) return;
  let layer = document.getElementById("cursor-layer");
  if (!layer) {
    layer = el("div", { id: "cursor-layer" });
    wrap.append(layer);
  }

  const states = app.provider.awareness.getStates() as Map<number, PeerState>;
  const cursors: HTMLElement[] = [];
  for (const [clientId, state] of states) {
    if (clientId === app.shared.doc.clientID) continue;
    if (!state.cursor || !state.user) continue;
    cursors.push(
      el("div", {
        class: "cursor",
        style: `left:${state.cursor.x}px;top:${state.cursor.y}px;--c:${state.user.color}`,
      }, [
        el("span", { class: "cursor-dot" }),
        el("span", { class: "cursor-label" }, [`${state.user.name} · ${state.user.deviceLabel}`]),
      ]),
    );
  }
  layer.replaceChildren(...cursors);
}

export function renderPeers(app: AppContext): HTMLElement {
  const states = app.provider.awareness.getStates() as Map<number, PeerState>;
  const seen = new Set<string>();
  const avatars: HTMLElement[] = [];
  for (const [, state] of states) {
    if (!state.user) continue;
    const key = state.user.userId;
    if (seen.has(key)) continue;
    seen.add(key);
    avatars.push(
      el("span", {
        class: "avatar",
        style: `--c:${state.user.color}`,
        title: `${state.user.name} · ${state.user.deviceLabel}`,
      }, [initials(state.user.name)]),
    );
  }
  return el("div", { class: "peers" }, avatars);
}

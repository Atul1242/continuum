# Continuum

**A workspace that resumes itself.** Start building a dashboard on your laptop, lose the network, pick up on a tablet — Continuum reconstructs not just your saved data, but your exact working state: what you had selected, the workflow step you were on, where the canvas was scrolled, the half-finished widget you hadn't added yet, and every unsaved edit.

Built for the **StateSync Web** track — *websites that reconstruct a user's operational state across devices, crashes, and offline gaps.*

---

## The problem

Web apps throw away context constantly. Switch devices and you start over. Drop the connection and you lose unsaved work. Close the tab mid-task and the app comes back blank, or at best restores the last *saved* document — never the state you were actually in.

Most "sync" is really *data* sync: the server has the latest document, and a reload pulls it down. That restores *what you made*. It does not restore *what you were doing* — the selection, the step in a multi-stage task, the form you were halfway through, the edit you hadn't committed.

Continuum treats operational state as a first-class thing to capture, synchronise, and reconstruct.

## Who it's for

Operators working in stateful tools — dashboard builders, incident responders, analysts — who move between a laptop at their desk, a tablet in a meeting, and a phone on the way out, and who cannot afford to lose their place or their in-progress work when the network or the device changes under them.

## The core idea: reconstruct the operator, not just the data

Continuum splits shared state into three deliberately separate layers:

| Layer | What it holds | Why it's separate |
|-------|---------------|-------------------|
| **Committed** | The saved dashboard — widgets, layout, config | The shared source of truth |
| **Drafts** | Per-user *unsaved* edits | So in-progress work survives a device switch or crash before you ever hit Save |
| **Session** | Per-user operational state: selection, workflow step, scroll position, the inspector tab you had open, a half-filled "add widget" form | So a new device can *resume* your work, not just reload the document |

All three are CRDTs, so edits from any device merge deterministically with no central referee. Keeping drafts and session state *out* of the committed document is what separates Continuum from an ordinary collaborative editor.

## Features (and how they map to the brief)

- **State capture** — selection, workflow stage, scroll, open panels, and partially completed actions are captured continuously and written to the shared document.
- **State synchronisation** — a hand-written Yjs sync provider over WebSocket keeps every device and the server in agreement in real time.
- **Conflict resolution** — concurrent edits merge automatically via CRDTs; the Note body merges character-by-character across devices. An Activity panel surfaces each merge so the resolution is *legible* instead of silent.
- **Cross-device recovery** — open the same workspace as the same user on another device and Continuum offers to resume you at the exact stage, with your unsaved changes intact.
- **Offline / online transition** — the app is local-first (IndexedDB). It works fully offline, queues nothing fragile (the sync protocol is state-based, so reconnection reconciles both sides), and shows a live connection state. A "Simulate offline" switch demonstrates it without unplugging anything.
- **Restoration of unfinished workflows** — a half-finished "add widget" form and the workflow step you were on are reconstructed on the next device.

## How it works

A single [Yjs](https://docs.yjs.dev/) document holds the three state layers. It persists locally to **IndexedDB** (so a cold, offline start still knows where you were) and synchronises through a thin **WebSocket relay** that keeps one authoritative document per workspace and persists it to disk.

The networking is written from scratch on top of the standard Yjs sync and awareness protocols — not the off-the-shelf `y-websocket` — so the connection lifecycle (offline detection, reconnection with backoff, the demo offline switch, and presence) is fully owned by the app.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design, data flow, and the trade-offs behind each decision.

## Tech stack

- **Language:** TypeScript (strict), no UI framework — the DOM layer is a small set of pure render functions, so the state and sync engineering stays front and centre.
- **State / CRDT:** Yjs
- **Local persistence:** y-indexeddb
- **Transport:** a custom provider + relay built on `y-protocols` (sync + awareness) over `ws`
- **Build/dev:** Vite

## Running it

```bash
npm install
npm run dev
```

This starts the Vite dev server (`http://localhost:5173`) and the sync relay (`ws://localhost:1234`) together.

**See it resume across "devices":**

1. Open `http://localhost:5173/?user=demo` in one window and edit something — select a widget, change the workflow step, start adding a widget but don't finish, type an unsaved change.
2. Open `http://localhost:5173/?user=demo` in a *second* window (a new tab counts as a new device). It offers to resume you exactly where you left off.
3. On a real second device on the same network, use `http://<your-laptop-ip>:5173/?user=demo`.

**See conflict resolution:** open the same workspace as two *different* users (`?user=a` and `?user=b`) and type into the same Note — the text merges character by character. The Activity panel logs each merge.

**See offline survival:** click **Simulate offline**, keep editing, then **Come back online** — your edits reconcile automatically.

## Project structure

```
src/
  core/        state, identity, persistence, sync provider, session engine, conflict watcher
  ui/          palette, canvas, inspector, chrome, presence — pure render functions
  main.ts      orchestration: wires the document, provider, session, and UI together
server/
  index.ts     the WebSocket relay — one Y.Doc per workspace, persisted to disk
docs/
  ARCHITECTURE.md   full design and trade-offs
  DEMO.md           a 90-second demo script
```

## Honest limitations

- The relay authenticates nothing — any client may join any workspace. Production would need auth and per-workspace authorisation (the permission field in session state is modelled but not enforced server-side).
- Server persistence is a simple whole-document snapshot to disk, debounced. A real deployment would use an append-only update log.
- Session state is retained indefinitely; it has no TTL or garbage collection.

These are deliberate scope choices, not oversights — see the architecture notes for where each would slot in.

## License

MIT — see [`LICENSE`](LICENSE).

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
- **Workspace tooling** — drag to move or resize widgets on a grid, rename the dashboard inline, and copy a one-click share link that reopens the same workspace, as you, on another device.

## How it works

A single [Yjs](https://docs.yjs.dev/) document holds the three state layers. It persists locally to **IndexedDB** (so a cold, offline start still knows where you were) and synchronises through a thin **WebSocket relay** that keeps one authoritative document per workspace and persists it to disk.

The networking is written from scratch on top of the standard Yjs sync and awareness protocols — not the off-the-shelf `y-websocket` — so the connection lifecycle (offline detection, reconnection with backoff, the demo offline switch, and presence) is fully owned by the app.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design, data flow, and the trade-offs behind each decision.

## Tech stack

- **Language:** TypeScript (strict), no UI framework — the DOM layer is a small set of pure render functions, so the state and sync engineering stays front and centre.
- **State / CRDT:** Yjs
- **Local persistence:** y-indexeddb
- **Transport:** a custom provider + relay built on `y-protocols` (sync + awareness) over `ws`
- **Backend:** Fastify + SQLite (`node:sqlite`) — REST API, accounts, and durable document storage ([docs/BACKEND.md](docs/BACKEND.md))
- **Build/dev:** Vite

## Running it

```bash
npm install
npm run dev
```

This starts the Vite dev server (`http://localhost:5173`) and the backend — REST API and realtime sync — on `http://localhost:8787`. See [`docs/BACKEND.md`](docs/BACKEND.md) for the API and database.

**See it resume across "devices":**

1. Open `http://localhost:5173/?user=demo` in one window and edit something — select a widget, change the workflow step, start adding a widget but don't finish, type an unsaved change.
2. Open `http://localhost:5173/?user=demo` in a *second* window (a new tab counts as a new device). It offers to resume you exactly where you left off.
3. On a real second device on the same network, use `http://<your-laptop-ip>:5173/?user=demo`.

**See conflict resolution:** open the same workspace as two *different* users (`?user=a` and `?user=b`) and type into the same Note — the text merges character by character. The Activity panel logs each merge.

**See offline survival:** click **Simulate offline**, keep editing, then **Come back online** — your edits reconcile automatically.

**Requiring a shared secret (optional):** start the relay with a token and clients must present it.

```bash
SYNC_TOKEN=some-secret npm run dev
# then open http://localhost:5173/?token=some-secret
```

## Project structure

```
src/
  core/        state, identity, persistence, sync provider, session engine, conflict watcher
  ui/          palette, canvas, inspector, chrome, presence — pure render functions
  main.ts      orchestration: wires the document, provider, session, and UI together
server/        Fastify API + Yjs sync on one port, backed by SQLite
  index.ts     entry; config.ts, db.ts, store.ts, auth.ts, models.ts, sync.ts, api.ts
docs/
  ARCHITECTURE.md   full design and trade-offs
  BACKEND.md        REST API, database schema, and persistence
  DEMO.md           a 90-second demo script
```

## Security

Continuum is a local-first app, which removes a whole class of exposure — sensitive state lives in the browser and is only shared with peers you invite into a workspace. On top of that:

- **No HTML injection path.** Every piece of user or peer content — widget titles, note bodies, table cells, display names, cursors — is rendered through text nodes, never `innerHTML`. There is no string-to-DOM sink in the codebase.
- **Optional shared-secret auth.** Set `SYNC_TOKEN` and the relay rejects any client that doesn't present it (`?token=`). Unset by default so local demos stay frictionless.
- **Workspace-name validation.** Names are constrained to `[a-z0-9_-]{1,64}` on both client and server, so they can't be used for path traversal when the server snapshots a workspace to disk.
- **Crash-proof framing.** The relay caps frame size and wraps every decode in a guard, so a malformed or oversized message can't take down a connection or the process.
- **Password security.** Accounts use scrypt-hashed, salted passwords — never stored in the clear — and opaque session tokens kept in httpOnly cookies, so scripts can't read them.

## Honest limitations

- Accounts exist (scrypt + sessions), but per-workspace authorisation isn't enforced yet — any client may still open any workspace's sync socket. The `members`/`role` tables are in place for it, and wiring the frontend sign-in to them is the next step.
- The in-document session (operational) state has no TTL or garbage collection.

These are deliberate scope choices, not oversights — see the architecture notes for where each would slot in.

## License

MIT — see [`LICENSE`](LICENSE).

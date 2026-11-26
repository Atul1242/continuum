# Backend

One Node process serves everything on a single port (default **8787**): the REST
API under `/api`, and the Yjs realtime sync protocol under `/sync/<workspace>`.
It is built on **Fastify** with an embedded **SQLite** database (Node's built-in
`node:sqlite` — no native dependencies).

```
server/
  index.ts    entry — Fastify app + shared WebSocket upgrade + listen
  config.ts   environment-driven configuration
  db.ts       opens SQLite (WAL) and applies the schema
  store.ts    Yjs document persistence — append-only update log + snapshots
  auth.ts     scrypt password hashing, sessions
  models.ts   typed data access (users, workspaces, members, activity, stats)
  sync.ts     the realtime sync server, persisting to the DB and logging activity
  api.ts      REST routes
```

## Data model

| Table | Purpose |
|-------|---------|
| `users` | account id, email, name, scrypt `password_hash`, colour |
| `sessions` | opaque session tokens with expiry (one per sign-in) |
| `workspaces` | a dashboard: id (the room name), name, owner, timestamps |
| `members` | who can access a workspace, with a role (owner/editor/viewer) |
| `doc_updates` | the append-only Yjs update log, one row per update |
| `doc_snapshots` | a compacted snapshot per workspace, with the last folded update id |
| `activity` | server-side audit events (join/leave/…) per workspace |

## Document persistence

A workspace's document is **not** stored as one blob. Every update a client makes
is appended to `doc_updates`. Loading a workspace replays its latest snapshot and
every update after it. Once the log passes a threshold (`compactEvery`, default
200) it is folded into a fresh snapshot and pruned. This keeps writes cheap and
append-only while bounding replay cost — the real version of the log the
architecture notes describe. Because the document lives in the database, it
survives a server restart with no loss.

## Authentication

Passwords are hashed with **scrypt** (salted, from `node:crypto`) and never
stored in the clear. Signing in creates a row in `sessions` and sets an
**httpOnly** cookie holding an opaque token, so the browser's scripts never see
it. Every request resolves `request.user` from that cookie; the sync socket reads
the same cookie to attribute activity to a signed-in user.

Set `SYNC_TOKEN` to additionally require a shared secret on the sync socket.

## REST API

All bodies and responses are JSON. Errors use the shape `{ "error": "..." }`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | liveness, version, uptime |
| `GET` | `/api/stats` | row counts and live room/connection counts |
| `POST` | `/api/auth/register` | `{ email, name, password }` → creates account, signs in |
| `POST` | `/api/auth/login` | `{ email, password }` → signs in |
| `POST` | `/api/auth/logout` | ends the current session |
| `GET` | `/api/auth/me` | the signed-in user, or `null` |
| `GET` | `/api/workspaces` | workspaces (the user's when signed in) with counts |
| `POST` | `/api/workspaces` | `{ name, id? }` → create a workspace |
| `GET` | `/api/workspaces/:id` | one workspace |
| `PATCH` | `/api/workspaces/:id` | `{ name }` → rename |
| `DELETE` | `/api/workspaces/:id` | delete (owner only) |
| `GET` | `/api/workspaces/:id/activity` | recent audit events |

### Example

```bash
# create an account (stores the session cookie)
curl -c jar -H 'content-type: application/json' \
  -d '{"email":"ava@example.com","name":"Ava","password":"secret123"}' \
  http://localhost:8787/api/auth/register

# who am I
curl -b jar http://localhost:8787/api/auth/me

# create a workspace
curl -b jar -H 'content-type: application/json' \
  -d '{"name":"Ops board"}' http://localhost:8787/api/workspaces
```

## Realtime sync

Clients open `ws://<host>:8787/sync/<workspace>` (optionally `?token=`). The
server validates the workspace name, attributes the connection to the signed-in
user if a session cookie is present, loads the document from the database, and
speaks the standard Yjs sync + awareness protocols. Each incoming update is
persisted to `doc_updates` and broadcast to the other clients.

## Configuration

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `8787` | HTTP + sync port |
| `DB_PATH` | `.data/continuum.db` | SQLite file |
| `SYNC_TOKEN` | — | optional shared secret for the sync socket |
| `CORS_ORIGIN` | reflect | allowed browser origin |

## Running

```bash
npm run dev          # Vite (5173) + API/sync (8787) together
npm run server       # just the backend, with reload
npm run server:prod  # backend without the file watcher
```

The database and client API client are versioned so the frontend can adopt
accounts next: `src/core/api.ts` already wraps every endpoint above.

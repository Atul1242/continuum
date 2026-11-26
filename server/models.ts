import { randomUUID } from "node:crypto";
import { db } from "./db";

// Typed data-access helpers over the SQLite tables. Routes and the sync server
// call these rather than writing SQL inline.

const COLORS = ["#1f78ff", "#2f9e6b", "#b9802a", "#cf4d5f", "#7a5af8", "#0ea5a5"];
function pickColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

// ---- Users ---------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string;
  color: string;
  created_at: number;
}

const insertUser = db.prepare(
  "INSERT INTO users (id, email, name, password_hash, color, created_at) VALUES (?, ?, ?, ?, ?, ?)",
);
const userByEmail = db.prepare("SELECT * FROM users WHERE email = ?");
const userById = db.prepare("SELECT id, email, name, color, created_at FROM users WHERE id = ?");

export function createUser(email: string, name: string, passwordHash: string): User {
  const id = randomUUID();
  const color = pickColor(email);
  insertUser.run(id, email.toLowerCase(), name, passwordHash, color, Date.now());
  return { id, email: email.toLowerCase(), name, color, created_at: Date.now() };
}

export function findUserByEmail(email: string): (User & { password_hash: string }) | undefined {
  return userByEmail.get(email.toLowerCase()) as (User & { password_hash: string }) | undefined;
}

export function findUserById(id: string): User | undefined {
  return userById.get(id) as User | undefined;
}

// ---- Workspaces ----------------------------------------------------------

export interface Workspace {
  id: string;
  name: string;
  owner_id: string | null;
  created_at: number;
  updated_at: number;
}

const wsById = db.prepare("SELECT * FROM workspaces WHERE id = ?");
const insertWs = db.prepare(
  "INSERT INTO workspaces (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
);
const renameWs = db.prepare("UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?");
const touchWs = db.prepare("UPDATE workspaces SET updated_at = ? WHERE id = ?");
const deleteWs = db.prepare("DELETE FROM workspaces WHERE id = ?");
const deleteWsUpdates = db.prepare("DELETE FROM doc_updates WHERE workspace_id = ?");
const deleteWsSnapshot = db.prepare("DELETE FROM doc_snapshots WHERE workspace_id = ?");
const deleteWsActivity = db.prepare("DELETE FROM activity WHERE workspace_id = ?");
const listWs = db.prepare(`
  SELECT w.*,
    (SELECT COUNT(*) FROM members m WHERE m.workspace_id = w.id) AS member_count,
    (SELECT COUNT(*) FROM doc_updates d WHERE d.workspace_id = w.id) AS update_count
  FROM workspaces w ORDER BY w.updated_at DESC LIMIT ?`);
const listWsForUser = db.prepare(`
  SELECT w.*,
    (SELECT COUNT(*) FROM members m WHERE m.workspace_id = w.id) AS member_count,
    (SELECT COUNT(*) FROM doc_updates d WHERE d.workspace_id = w.id) AS update_count
  FROM workspaces w
  WHERE w.owner_id = ? OR w.id IN (SELECT workspace_id FROM members WHERE user_id = ?)
  ORDER BY w.updated_at DESC LIMIT ?`);

export function getWorkspace(id: string): Workspace | undefined {
  return wsById.get(id) as Workspace | undefined;
}

/** Called by the sync server the first time a room is opened. */
export function ensureWorkspace(id: string, ownerId: string | null): Workspace {
  const existing = getWorkspace(id);
  if (existing) return existing;
  const now = Date.now();
  insertWs.run(id, defaultName(id), ownerId, now, now);
  if (ownerId) addMember(id, ownerId, "owner");
  return { id, name: defaultName(id), owner_id: ownerId, created_at: now, updated_at: now };
}

export function createWorkspace(id: string, name: string, ownerId: string | null): Workspace {
  const now = Date.now();
  insertWs.run(id, name, ownerId, now, now);
  if (ownerId) addMember(id, ownerId, "owner");
  return { id, name, owner_id: ownerId, created_at: now, updated_at: now };
}

export function setWorkspaceName(id: string, name: string): void {
  renameWs.run(name, Date.now(), id);
}

export function touchWorkspace(id: string): void {
  touchWs.run(Date.now(), id);
}

export function removeWorkspace(id: string): void {
  deleteWsUpdates.run(id);
  deleteWsSnapshot.run(id);
  deleteWsActivity.run(id);
  deleteWs.run(id);
}

export function listWorkspaces(userId: string | null, limit = 50): unknown[] {
  return userId ? listWsForUser.all(userId, userId, limit) : listWs.all(limit);
}

function defaultName(id: string): string {
  return id === "main" ? "Operations dashboard" : id.replace(/[-_]/g, " ");
}

// ---- Members -------------------------------------------------------------

const insertMember = db.prepare(
  `INSERT INTO members (workspace_id, user_id, role, added_at) VALUES (?, ?, ?, ?)
   ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = excluded.role`,
);

export function addMember(workspaceId: string, userId: string, role = "editor"): void {
  insertMember.run(workspaceId, userId, role, Date.now());
}

// ---- Activity ------------------------------------------------------------

export interface ActivityEvent {
  id: number;
  workspace_id: string;
  kind: string;
  actor: string | null;
  message: string;
  created_at: number;
}

const insertActivity = db.prepare(
  "INSERT INTO activity (workspace_id, kind, actor, message, created_at) VALUES (?, ?, ?, ?, ?)",
);
const listActivityStmt = db.prepare(
  "SELECT * FROM activity WHERE workspace_id = ? ORDER BY id DESC LIMIT ?",
);

export function addActivity(workspaceId: string, kind: string, actor: string | null, message: string): void {
  insertActivity.run(workspaceId, kind, actor, message, Date.now());
}

export function listActivity(workspaceId: string, limit = 50): ActivityEvent[] {
  return listActivityStmt.all(workspaceId, limit) as unknown as ActivityEvent[];
}

// ---- Stats ---------------------------------------------------------------

export function counts(): Record<string, number> {
  const one = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
  return {
    users: one("SELECT COUNT(*) AS n FROM users"),
    workspaces: one("SELECT COUNT(*) AS n FROM workspaces"),
    updates: one("SELECT COUNT(*) AS n FROM doc_updates"),
    activity: one("SELECT COUNT(*) AS n FROM activity"),
    sessions: one("SELECT COUNT(*) AS n FROM sessions"),
  };
}

import type { FastifyInstance, FastifyReply } from "fastify";

import { config } from "./config";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  sessionUser,
  type SessionUser,
} from "./auth";
import {
  createUser,
  findUserByEmail,
  counts,
  listWorkspaces,
  createWorkspace,
  getWorkspace,
  setWorkspaceName,
  removeWorkspace,
  listActivity,
} from "./models";
import { syncStats } from "./sync";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

type Body = Record<string, string | undefined>;

export function registerApi(app: FastifyInstance): void {
  // Attach the signed-in user (if any) to every request.
  app.decorateRequest("user", null);
  app.addHook("preHandler", async (req) => {
    req.user = sessionUser(req.cookies[config.cookieName]);
  });

  app.get("/api/health", async () => ({
    status: "ok",
    version: config.version,
    uptime: Math.round(process.uptime()),
  }));

  app.get("/api/stats", async () => ({ db: counts(), live: syncStats() }));

  // ---- Auth --------------------------------------------------------------

  app.post("/api/auth/register", async (req, reply) => {
    const { email, name, password } = (req.body ?? {}) as Body;
    if (!validEmail(email)) return reply.code(400).send({ error: "A valid email is required" });
    if (!name || !name.trim()) return reply.code(400).send({ error: "Name is required" });
    if (!password || password.length < 6) {
      return reply.code(400).send({ error: "Password must be at least 6 characters" });
    }
    if (findUserByEmail(email)) return reply.code(409).send({ error: "That email is already registered" });

    const user = createUser(email, name.trim(), hashPassword(password));
    issueSession(reply, user.id, req.headers["user-agent"]);
    return { user };
  });

  app.post("/api/auth/login", async (req, reply) => {
    const { email, password } = (req.body ?? {}) as Body;
    const row = email ? findUserByEmail(email) : undefined;
    if (!row || !password || !verifyPassword(password, row.password_hash)) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    issueSession(reply, row.id, req.headers["user-agent"]);
    return { user: { id: row.id, email: row.email, name: row.name, color: row.color } };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies[config.cookieName];
    if (token) destroySession(token);
    reply.clearCookie(config.cookieName, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req) => ({ user: req.user }));

  // ---- Workspaces --------------------------------------------------------

  app.get("/api/workspaces", async (req) => ({
    workspaces: listWorkspaces(req.user?.id ?? null),
  }));

  app.post("/api/workspaces", async (req, reply) => {
    const { id, name } = (req.body ?? {}) as Body;
    const wsName = (name ?? "").trim() || "Untitled dashboard";
    const wsId = ((id ?? "").trim() || slug(wsName));
    if (!/^[a-z0-9_-]{1,64}$/i.test(wsId)) return reply.code(400).send({ error: "Invalid workspace id" });
    if (getWorkspace(wsId)) return reply.code(409).send({ error: "That workspace already exists" });
    return { workspace: createWorkspace(wsId, wsName, req.user?.id ?? null) };
  });

  app.get("/api/workspaces/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const ws = getWorkspace(id);
    if (!ws) return reply.code(404).send({ error: "Not found" });
    return { workspace: ws };
  });

  app.patch("/api/workspaces/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { name } = (req.body ?? {}) as Body;
    if (!getWorkspace(id)) return reply.code(404).send({ error: "Not found" });
    if (!name || !name.trim()) return reply.code(400).send({ error: "Name is required" });
    setWorkspaceName(id, name.trim().slice(0, 80));
    return { workspace: getWorkspace(id) };
  });

  app.delete("/api/workspaces/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const ws = getWorkspace(id);
    if (!ws) return reply.code(404).send({ error: "Not found" });
    if (!req.user) return reply.code(401).send({ error: "Sign in to delete a workspace" });
    if (ws.owner_id && ws.owner_id !== req.user.id) {
      return reply.code(403).send({ error: "Only the owner can delete this workspace" });
    }
    removeWorkspace(id);
    return { ok: true };
  });

  app.get("/api/workspaces/:id/activity", async (req) => {
    const { id } = req.params as { id: string };
    const q = req.query as Record<string, string>;
    const limit = Math.min(200, Number(q.limit ?? 50) || 50);
    return { activity: listActivity(id, limit) };
  });
}

function issueSession(reply: FastifyReply, userId: string, ua: string | undefined): void {
  const token = createSession(userId, ua);
  reply.setCookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  });
}

function validEmail(email: string | undefined): email is string {
  return typeof email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "workspace";
}

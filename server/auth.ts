import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db";
import { config } from "./config";

// Password hashing with scrypt (salted, from node:crypto — no third-party crypto)
// and opaque session tokens stored in the database. The token lives in an
// httpOnly cookie, so the browser never exposes it to scripts.

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  color: string;
}

const insertSession = db.prepare(
  "INSERT INTO sessions (token, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)",
);
const deleteSession = db.prepare("DELETE FROM sessions WHERE token = ?");
const selectSessionUser = db.prepare(
  `SELECT u.id, u.email, u.name, u.color, s.expires_at AS expiresAt
   FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
);

export function createSession(userId: string, userAgent: string | undefined): string {
  const token = randomUUID().replace(/-/g, "") + randomBytes(8).toString("hex");
  const now = Date.now();
  insertSession.run(token, userId, now, now + config.sessionTtlMs, userAgent ?? null);
  return token;
}

export function destroySession(token: string): void {
  deleteSession.run(token);
}

export function sessionUser(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const row = selectSessionUser.get(token) as (SessionUser & { expiresAt: number }) | undefined;
  if (!row) return null;
  if (Number(row.expiresAt) < Date.now()) {
    deleteSession.run(token);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, color: row.color };
}

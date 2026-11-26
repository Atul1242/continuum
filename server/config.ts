import { join } from "node:path";

// All backend configuration in one place, overridable by environment.
export const config = {
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 8787),
  dbPath: process.env.DB_PATH ?? join(process.cwd(), ".data", "continuum.db"),
  // Optional shared secret for the sync socket; unset = open (local demos).
  syncToken: process.env.SYNC_TOKEN ?? "",
  // In dev we reflect the request origin; set CORS_ORIGIN to lock it down.
  corsOrigin: process.env.CORS_ORIGIN ?? true,
  sessionTtlMs: 1000 * 60 * 60 * 24 * 30, // 30 days
  cookieName: "continuum_sid",
  // Snapshot a workspace's update log once it grows past this many rows.
  compactEvery: 200,
  version: "0.1.0",
} as const;

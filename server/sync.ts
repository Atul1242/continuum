import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

import { config } from "./config";
import { loadDoc, persistUpdate, maybeCompact } from "./store";
import { ensureWorkspace, touchWorkspace, addActivity } from "./models";
import { sessionUser } from "./auth";

// The realtime layer. Each workspace has one authoritative Y.Doc loaded from the
// database; every update a client makes is appended to the durable log and then
// broadcast to the other clients. Awareness (presence) stays ephemeral.

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const ROOM_RE = /^[a-z0-9_-]{1,64}$/i;

interface Room {
  name: string;
  doc: Y.Doc;
  awareness: Awareness;
  conns: Map<WebSocket, Set<number>>;
  dirty: boolean;
}

const rooms = new Map<string, Room>();

function getRoom(name: string): Room {
  const existing = rooms.get(name);
  if (existing) return existing;

  const doc = loadDoc(name);
  const awareness = new Awareness(doc);
  awareness.setLocalState(null); // the server is not a participant
  const room: Room = { name, doc, awareness, conns: new Map(), dirty: false };

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    persistUpdate(name, update);
    room.dirty = true;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeUpdate(enc, update);
    const msg = encoding.toUint8Array(enc);
    for (const conn of room.conns.keys()) {
      if (conn !== origin && conn.readyState === WebSocket.OPEN) conn.send(msg);
    }
  });

  awareness.on(
    "update",
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      const changed = [...added, ...updated, ...removed];
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(enc, encodeAwarenessUpdate(awareness, changed));
      const msg = encoding.toUint8Array(enc);
      for (const conn of room.conns.keys()) {
        if (conn !== origin && conn.readyState === WebSocket.OPEN) conn.send(msg);
      }
    },
  );

  rooms.set(name, room);
  return room;
}

// Periodically mark touched workspaces and compact long update logs.
setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.dirty) continue;
    room.dirty = false;
    touchWorkspace(room.name);
    maybeCompact(room.name, room.doc);
  }
}, 4000).unref();

export function syncStats(): { rooms: number; connections: number } {
  let connections = 0;
  for (const room of rooms.values()) connections += room.conns.size;
  return { rooms: rooms.size, connections };
}

export function attachSync(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });

  server.on("upgrade", (req, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "", "http://localhost");
    } catch {
      socket.destroy();
      return;
    }
    if (!url.pathname.startsWith("/sync/")) {
      socket.destroy();
      return;
    }
    const name = decodeURIComponent(url.pathname.slice("/sync/".length));
    if (!ROOM_RE.test(name)) {
      socket.destroy();
      return;
    }
    if (config.syncToken && url.searchParams.get("token") !== config.syncToken) {
      socket.destroy();
      return;
    }
    const cookies = req.headers.cookie ? parseCookie(req.headers.cookie) : {};
    const user = sessionUser(cookies[config.cookieName]);
    wss.handleUpgrade(req, socket, head, (ws) => {
      onConnect(ws, name, user?.id ?? null, user?.name ?? null);
    });
  });
}

function onConnect(conn: WebSocket, name: string, userId: string | null, userName: string | null): void {
  ensureWorkspace(name, userId);
  const room = getRoom(name);
  const controlled = new Set<number>();
  room.conns.set(conn, controlled);
  conn.binaryType = "arraybuffer";
  addActivity(name, "join", userId, `${userName ?? "A guest"} connected`);

  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  syncProtocol.writeSyncStep1(enc, room.doc);
  conn.send(encoding.toUint8Array(enc));

  const states = room.awareness.getStates();
  if (states.size > 0) {
    const aenc = encoding.createEncoder();
    encoding.writeVarUint(aenc, MSG_AWARENESS);
    encoding.writeVarUint8Array(aenc, encodeAwarenessUpdate(room.awareness, [...states.keys()]));
    conn.send(encoding.toUint8Array(aenc));
  }

  conn.on("message", (data: ArrayBuffer) => {
    try {
      const decoder = decoding.createDecoder(new Uint8Array(data));
      const reply = encoding.createEncoder();
      const type = decoding.readVarUint(decoder);
      if (type === MSG_SYNC) {
        encoding.writeVarUint(reply, MSG_SYNC);
        syncProtocol.readSyncMessage(decoder, reply, room.doc, conn);
        if (encoding.length(reply) > 1) conn.send(encoding.toUint8Array(reply));
      } else if (type === MSG_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder);
        const before = new Set(room.awareness.getStates().keys());
        applyAwarenessUpdate(room.awareness, update, conn);
        for (const id of room.awareness.getStates().keys()) {
          if (!before.has(id)) controlled.add(id);
        }
      }
    } catch (err) {
      console.error(`[sync] bad frame on "${name}":`, err);
    }
  });

  conn.on("close", () => {
    room.conns.delete(conn);
    removeAwarenessStates(room.awareness, [...controlled], null);
    addActivity(name, "leave", userId, `${userName ?? "A guest"} disconnected`);
  });
}

function parseCookie(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

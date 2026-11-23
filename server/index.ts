import { WebSocketServer, WebSocket } from "ws";
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
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// The relay. It is deliberately thin: one Y.Doc per workspace, the standard
// sync + awareness protocols, and periodic persistence to disk. It holds no
// business logic and makes no decisions about conflicts — the CRDT does that.
// Clients remain fully functional without it; it only accelerates sharing.

const PORT = Number(process.env.SYNC_PORT ?? 1234);
const STORE_DIR = join(process.cwd(), ".sync-store");
mkdirSync(STORE_DIR, { recursive: true });

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

interface Room {
  name: string;
  doc: Y.Doc;
  awareness: Awareness;
  conns: Map<WebSocket, Set<number>>;
  saveTimer: NodeJS.Timeout | null;
}

const rooms = new Map<string, Room>();

function storePath(name: string): string {
  return join(STORE_DIR, `${name.replace(/[^a-z0-9_-]/gi, "_")}.bin`);
}

function getRoom(name: string): Room {
  let room = rooms.get(name);
  if (room) return room;

  const doc = new Y.Doc();
  const path = storePath(name);
  if (existsSync(path)) {
    try {
      Y.applyUpdate(doc, readFileSync(path));
    } catch (err) {
      console.error(`[continuum] could not load "${name}":`, err);
    }
  }

  const awareness = new Awareness(doc);
  awareness.setLocalState(null); // the server is not a participant

  room = { name, doc, awareness, conns: new Map(), saveTimer: null };

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeUpdate(enc, update);
    const msg = encoding.toUint8Array(enc);
    for (const conn of room!.conns.keys()) {
      if (conn !== origin && conn.readyState === WebSocket.OPEN) conn.send(msg);
    }
    scheduleSave(room!);
  });

  awareness.on(
    "update",
    ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const changed = [...added, ...updated, ...removed];
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(enc, encodeAwarenessUpdate(awareness, changed));
      const msg = encoding.toUint8Array(enc);
      for (const conn of room!.conns.keys()) {
        if (conn !== origin && conn.readyState === WebSocket.OPEN) conn.send(msg);
      }
    },
  );

  rooms.set(name, room);
  return room;
}

function scheduleSave(room: Room): void {
  if (room.saveTimer) return;
  room.saveTimer = setTimeout(() => {
    room.saveTimer = null;
    try {
      writeFileSync(storePath(room.name), Y.encodeStateAsUpdate(room.doc));
    } catch (err) {
      console.error(`[continuum] could not save "${room.name}":`, err);
    }
  }, 1500);
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (conn, req) => {
  const name = (req.url ?? "/main").slice(1).split("?")[0] || "main";
  const room = getRoom(name);
  const controlled = new Set<number>();
  room.conns.set(conn, controlled);
  conn.binaryType = "arraybuffer";

  // Step 1: ask the client what it has, so we can send what it's missing.
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, MSG_SYNC);
  syncProtocol.writeSyncStep1(enc, room.doc);
  conn.send(encoding.toUint8Array(enc));

  // Push any awareness we already know about.
  const states = room.awareness.getStates();
  if (states.size > 0) {
    const aenc = encoding.createEncoder();
    encoding.writeVarUint(aenc, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      aenc,
      encodeAwarenessUpdate(room.awareness, Array.from(states.keys())),
    );
    conn.send(encoding.toUint8Array(aenc));
  }

  conn.on("message", (data: ArrayBuffer) => {
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
  });

  conn.on("close", () => {
    room.conns.delete(conn);
    removeAwarenessStates(room.awareness, Array.from(controlled), null);
    console.log(`[continuum] "${name}" — ${room.conns.size} client(s)`);
  });

  console.log(`[continuum] "${name}" — ${room.conns.size} client(s)`);
});

console.log(`[continuum] sync server listening on ws://localhost:${PORT}`);

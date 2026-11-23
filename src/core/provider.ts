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

// A minimal Yjs network provider written from scratch on top of the standard
// sync + awareness protocols. It intentionally does not use y-websocket so the
// connection lifecycle — offline detection, reconnection, and a demo-friendly
// "go offline" switch — is fully owned here.
//
// Correctness note: Yjs sync is *state based*. On every (re)connection the
// client sends its state vector (sync step 1); the peer replies with only the
// updates the client is missing. That is why pulling the plug and editing while
// disconnected is safe — reconnecting reconciles both sides, in any order, with
// no lost writes and no manual replay queue.

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

export type ConnStatus = "connecting" | "online" | "offline";

type StatusListener = (status: ConnStatus) => void;

export class SyncProvider {
  readonly awareness: Awareness;
  status: ConnStatus = "connecting";

  private readonly url: string;
  private readonly doc: Y.Doc;
  private ws: WebSocket | null = null;
  private shouldConnect = true;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly statusListeners = new Set<StatusListener>();

  constructor(url: string, doc: Y.Doc, awareness: Awareness) {
    this.url = url;
    this.doc = doc;
    this.awareness = awareness;

    this.doc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);
    window.addEventListener("beforeunload", this.cleanupAwareness);

    this.open();
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  /** User-initiated reconnect (the "come back online" action). */
  connect(): void {
    this.shouldConnect = true;
    this.attempts = 0;
    this.open();
  }

  /** User-initiated disconnect used to demonstrate offline survival. */
  goOffline(): void {
    this.shouldConnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.setStatus("offline");
  }

  destroy(): void {
    this.shouldConnect = false;
    this.cleanupAwareness();
    this.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    window.removeEventListener("beforeunload", this.cleanupAwareness);
    this.ws?.close();
  }

  // --- connection lifecycle ------------------------------------------------

  private open(): void {
    if (!this.shouldConnect || this.ws) return;
    this.setStatus("connecting");

    const ws = new WebSocket(this.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.setStatus("online");
      // Step 1 of the sync: tell the server what we already have.
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeSyncStep1(enc, this.doc);
      this.sendRaw(encoding.toUint8Array(enc));
      // Announce our presence.
      this.broadcastAwareness(Array.from(this.awareness.getStates().keys()));
    };

    ws.onmessage = (event) => this.handleMessage(new Uint8Array(event.data as ArrayBuffer));

    ws.onclose = () => {
      this.ws = null;
      // Forget everyone else's presence; it will be re-learned on reconnect.
      removeAwarenessStates(
        this.awareness,
        Array.from(this.awareness.getStates().keys()).filter(
          (id) => id !== this.doc.clientID,
        ),
        this,
      );
      if (this.shouldConnect) {
        this.setStatus("connecting");
        this.scheduleReconnect();
      } else {
        this.setStatus("offline");
      }
    };

    ws.onerror = () => ws.close();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(15000, 500 * Math.pow(1.6, this.attempts++));
    const jitter = Math.random() * 400;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay + jitter);
  }

  // --- message handling ----------------------------------------------------

  private handleMessage(data: Uint8Array): void {
    const decoder = decoding.createDecoder(data);
    const encoder = encoding.createEncoder();
    const type = decoding.readVarUint(decoder);

    if (type === MSG_SYNC) {
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
      // readSyncMessage may have queued a reply (e.g. sync step 2).
      if (encoding.length(encoder) > 1) this.sendRaw(encoding.toUint8Array(encoder));
    } else if (type === MSG_AWARENESS) {
      applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
    }
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    // Don't echo updates that we just applied from the network.
    if (origin === this) return;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeUpdate(enc, update);
    this.sendRaw(encoding.toUint8Array(enc));
  };

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === this) return;
    this.broadcastAwareness([...added, ...updated, ...removed]);
  };

  private broadcastAwareness(clients: number[]): void {
    if (clients.length === 0) return;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc, encodeAwarenessUpdate(this.awareness, clients));
    this.sendRaw(encoding.toUint8Array(enc));
  }

  private cleanupAwareness = (): void => {
    removeAwarenessStates(this.awareness, [this.doc.clientID], "unload");
  };

  // --- transport -----------------------------------------------------------

  private sendRaw(data: Uint8Array): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
    // If we're not connected the write is simply not sent; IndexedDB already
    // holds it and the next sync step 1 will carry it across. No replay queue
    // is needed because the protocol is state based.
  }

  private setStatus(status: ConnStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }
}

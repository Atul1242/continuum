// Who is editing, and from which device.
//
// A *user* is stable across devices (stored in localStorage, or forced via
// ?user= in the URL). Two browsers carrying the same userId are treated as the
// same person moving between devices — that is the case Continuum is built to
// recover. A *device* is unique per tab, so opening a fresh tab behaves like
// picking up a different machine.

const PALETTE = [
  "#6ee7ff",
  "#a78bfa",
  "#f472b6",
  "#fca5a5",
  "#fcd34d",
  "#86efac",
  "#93c5fd",
];

export interface Identity {
  userId: string;
  deviceId: string;
  deviceLabel: string;
  name: string;
  color: string;
}

function rid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function guessDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/.test(ua)) return "Tablet";
  if (/Mobile|iPhone|Android/.test(ua)) return "Phone";
  return "Laptop";
}

export function resolveIdentity(): Identity {
  const url = new URL(location.href);

  const userId =
    url.searchParams.get("user") ??
    localStorage.getItem("continuum:userId") ??
    rid("user");
  localStorage.setItem("continuum:userId", userId);

  let deviceId = sessionStorage.getItem("continuum:deviceId");
  if (!deviceId) {
    deviceId = rid("dev");
    sessionStorage.setItem("continuum:deviceId", deviceId);
  }

  const deviceLabel =
    url.searchParams.get("device") ?? guessDeviceLabel();

  const name =
    url.searchParams.get("name") ??
    localStorage.getItem("continuum:name") ??
    `User ${userId.slice(-4)}`;
  localStorage.setItem("continuum:name", name);

  const color = PALETTE[hash(userId) % PALETTE.length]!;

  return { userId, deviceId, deviceLabel, name, color };
}

export function workspaceId(): string {
  const url = new URL(location.href);
  return url.searchParams.get("room") ?? "main";
}

// Typed client for the Continuum REST API. The realtime document sync uses its
// own WebSocket (see core/provider.ts); this covers accounts, workspaces, and
// the server-side activity log. Credentials are included so the session cookie
// travels with every call.

const BASE = `${location.protocol}//${location.hostname}:${__API_PORT__}/api`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  color: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  owner_id: string | null;
  created_at: number;
  updated_at: number;
  member_count: number;
  update_count: number;
}

export const api = {
  health: () => request<{ status: string; version: string; uptime: number }>("/health"),
  stats: () => request<{ db: Record<string, number>; live: { rooms: number; connections: number } }>("/stats"),

  me: () => request<{ user: ApiUser | null }>("/auth/me"),
  register: (email: string, name: string, password: string) =>
    request<{ user: ApiUser }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, name, password }),
    }),
  login: (email: string, password: string) =>
    request<{ user: ApiUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),

  listWorkspaces: () => request<{ workspaces: WorkspaceSummary[] }>("/workspaces"),
  createWorkspace: (name: string, id?: string) =>
    request<{ workspace: WorkspaceSummary }>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ name, id }),
    }),
  renameWorkspace: (id: string, name: string) =>
    request<{ workspace: WorkspaceSummary }>(`/workspaces/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  deleteWorkspace: (id: string) =>
    request<{ ok: true }>(`/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" }),
  activity: (id: string, limit = 50) =>
    request<{ activity: { id: number; kind: string; actor: string | null; message: string; created_at: number }[] }>(
      `/workspaces/${encodeURIComponent(id)}/activity?limit=${limit}`,
    ),
};

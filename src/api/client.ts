import { auth } from "@/firebase";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// fetchAPI attaches a fresh Firebase ID token on every call. The Firebase
// SDK refreshes tokens automatically (~1 hour TTL); calling getIdToken()
// each request is cheap when the cached token is still valid.
export async function fetchAPI<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error("VITE_API_BASE is not set");

  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (auth?.currentUser) {
    const token = await auth.currentUser.getIdToken();
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown = undefined;
  if (text) {
    try { body = JSON.parse(text); } catch { /* not JSON */ }
  }

  if (!res.ok) {
    const errBody = body as { error?: string; message?: string } | undefined;
    throw new ApiError(
      res.status,
      errBody?.message ?? errBody?.error ?? res.statusText,
      errBody?.error,
    );
  }
  return body as T;
}

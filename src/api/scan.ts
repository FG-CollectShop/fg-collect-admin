import { auth } from "@/firebase";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export interface DetectedBarcode {
  value: string;
  format?: string;
  vertices?: { x: number; y: number }[];
}

export interface DetectResponse {
  url: string;
  key: string;
  barcodes: DetectedBarcode[];
  warning?: string;
}

// Multipart upload — fetchAPI auto-sets Content-Type: application/json so
// we go around it for file uploads.
async function postFile<T>(path: string, file: File): Promise<T> {
  if (!API_BASE) throw new Error("VITE_API_BASE not set");
  const headers = new Headers();
  if (auth?.currentUser) {
    headers.set("Authorization", `Bearer ${await auth.currentUser.getIdToken()}`);
  }
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: fd,
  });
  const text = await res.text();
  let body: unknown;
  if (text) {
    try { body = JSON.parse(text); } catch { /* not json */ }
  }
  if (!res.ok) {
    const errBody = body as { error?: string; message?: string } | undefined;
    throw new Error(errBody?.message ?? errBody?.error ?? res.statusText);
  }
  return body as T;
}

// detectScan uploads the file AND runs barcode detection on it in a single
// round trip. Use this for graded slab intake.
export async function detectScan(file: File): Promise<DetectResponse> {
  return postFile<DetectResponse>("/api/v1/admin/scan/detect", file);
}

export async function uploadScan(file: File): Promise<{ url: string; key: string }> {
  return postFile("/api/v1/admin/scan/upload", file);
}

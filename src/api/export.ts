import { auth } from "@/firebase";
import type { Game } from "./catalog";
import type { GradingCompany } from "./graded";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

// Streams the eBay CSV with auth header. Returns a Blob the caller can
// hand to a temporary <a download> click.
export async function downloadEbayGradedCSV(opts: {
  game?: Game;
  grading_company?: GradingCompany;
  include_inactive?: boolean;
} = {}): Promise<{ blob: Blob; filename: string }> {
  if (!API_BASE) throw new Error("VITE_API_BASE not set");
  const params = new URLSearchParams();
  if (opts.game) params.set("game", opts.game);
  if (opts.grading_company) params.set("grading_company", opts.grading_company);
  if (opts.include_inactive) params.set("include_inactive", "true");

  const headers = new Headers();
  if (auth?.currentUser) {
    headers.set("Authorization", `Bearer ${await auth.currentUser.getIdToken()}`);
  }
  const qs = params.toString();
  const res = await fetch(
    `${API_BASE}/api/v1/admin/export/ebay/graded.csv${qs ? `?${qs}` : ""}`,
    { headers },
  );
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status} ${res.statusText}`);
  }
  // filename from Content-Disposition or fallback
  const disp = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="([^"]+)"/.exec(disp);
  const filename = m?.[1] ?? `ebay-graded-${Date.now()}.csv`;
  const blob = await res.blob();
  return { blob, filename };
}

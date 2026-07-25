import { fetchAPI } from "./client";
import type { Game } from "./catalog";

export type GradingCompany = "psa" | "bgs" | "sgc" | "cgc";

// Mirrors graded.CertInfo on the backend.
export interface CertInfo {
  company: GradingCompany;
  cert_number: string;
  grade: number;
  grade_label?: string;
  year?: number;
  brand?: string;
  subject?: string;
  card_number?: string;
  variety?: string;
  population_higher?: number;
  population_equal?: number;
  front_image_url?: string;
  back_image_url?: string;
  raw?: unknown;
}

export interface LookupResponse extends CertInfo {
  already_listed: boolean;
  listing_id?: string;
}

export async function lookupCert(
  certNumber: string,
  opts: { company?: GradingCompany; mirrorImages?: boolean } = {},
): Promise<LookupResponse> {
  return fetchAPI<LookupResponse>("/api/v1/admin/graded/lookup", {
    method: "POST",
    body: JSON.stringify({
      company: opts.company ?? "psa",
      cert_number: certNumber,
      mirror_images: opts.mirrorImages ?? true,
    }),
  });
}

export interface BatchCreateItem {
  game?: Game;
  company: GradingCompany;
  cert_number: string;
  price_cents: number;
  location?: string | null;
  raw_scan_url?: string | null;
  info: CertInfo;
}

export interface BatchCreateResult {
  cert_number: string;
  status: "created" | "skipped_duplicate" | "failed";
  listing_id?: string;
  error?: string;
}

export async function batchCreateGraded(req: {
  game: Game;
  location?: string | null;
  items: BatchCreateItem[];
  lot_id?: string;
}): Promise<{ results: BatchCreateResult[] }> {
  return fetchAPI("/api/v1/admin/graded/batch", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export interface GradedRow {
  listing_id: string;
  game: Game;
  name: string;
  company: GradingCompany;
  cert_number: string;
  grade: number;
  grade_label?: string;
  year?: number;
  brand?: string;
  subject?: string;
  card_number?: string;
  variety?: string;
  population_higher?: number;
  population_equal?: number;
  front_image_url?: string;
  back_image_url?: string;
  price_cents: number;
  stock: number;
  location?: string;
  active: boolean;
  updated_at: string;
}

export async function listGraded(opts: {
  game?: Game;
  grading_company?: GradingCompany;
  grade_min?: number;
  grade_max?: number;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: GradedRow[]; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (opts.game) params.set("game", opts.game);
  if (opts.grading_company) params.set("grading_company", opts.grading_company);
  if (opts.grade_min !== undefined) params.set("grade_min", String(opts.grade_min));
  if (opts.grade_max !== undefined) params.set("grade_max", String(opts.grade_max));
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return fetchAPI(`/api/v1/admin/graded${qs ? `?${qs}` : ""}`);
}

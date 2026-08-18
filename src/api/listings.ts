import { fetchAPI } from "./client";
import type { Game } from "./catalog";

export type ListingType = "single" | "sealed" | "graded";

export interface Listing {
  id: string;
  type: ListingType;
  game: Game;
  tcgplayer_product_id?: number;
  tcgplayer_sku_id?: number;
  name: string;
  set_name?: string;
  image_url?: string;
  price_cents: number;
  stock: number;
  location?: string;
  details: Record<string, unknown>;
}

export interface ListingsPage {
  items: Listing[];
  limit: number;
  offset: number;
}

// --- Public read (no auth) -------------------------------------------------

export async function listListings(opts: {
  game?: Game;
  type?: ListingType;
  limit?: number;
  offset?: number;
} = {}): Promise<ListingsPage> {
  const params = new URLSearchParams();
  if (opts.game) params.set("game", opts.game);
  if (opts.type) params.set("type", opts.type);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return fetchAPI<ListingsPage>(`/api/v1/listings${qs ? `?${qs}` : ""}`);
}

// --- Admin write (Firebase token) ------------------------------------------

export interface CreateListingInput {
  type: ListingType;
  game: Game;
  tcgplayer_product_id?: number | null;
  tcgplayer_sku_id?: number | null;
  name: string;
  set_name?: string | null;
  image_url?: string | null;
  price_cents: number;
  stock: number;
  location?: string | null;
  details?: Record<string, unknown>;
}

export async function createListing(body: CreateListingInput): Promise<Listing> {
  return fetchAPI<Listing>("/api/v1/admin/listings", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface UpdateListingInput {
  name?: string;
  set_name?: string | null;
  image_url?: string | null;
  price_cents?: number;
  location?: string | null;
  active?: boolean;
  details?: Record<string, unknown>;
}

export async function updateListing(id: string, body: UpdateListingInput): Promise<Listing> {
  return fetchAPI<Listing>(`/api/v1/admin/listings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export interface AdjustStockResponse {
  id: string;
  stock: number;
}

export async function adjustStock(
  id: string,
  delta: number,
  reason?: string,
): Promise<AdjustStockResponse> {
  return fetchAPI<AdjustStockResponse>(`/api/v1/admin/listings/${id}/adjust-stock`, {
    method: "POST",
    body: JSON.stringify({ delta, reason }),
  });
}

export async function getListing(id: string): Promise<Listing> {
  return fetchAPI<Listing>(`/api/v1/listings/${id}`);
}

export async function softDeleteListing(id: string): Promise<void> {
  return fetchAPI<void>(`/api/v1/admin/listings/${id}`, { method: "DELETE" });
}

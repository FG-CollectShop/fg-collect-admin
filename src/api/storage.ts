import { fetchAPI } from "./client";

export type BinKind =
  | "room" | "shelf" | "cabinet" | "drawer" | "tote"
  | "binder" | "slab_box" | "top_loader" | "slot" | "other";

export interface Bin {
  id: string;
  code: string;
  label?: string;
  parent_bin_id?: string;
  kind: BinKind;
  capacity?: number;
  notes?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  path?: string;
}

export interface Placement {
  id: string;
  listing_id: string;
  bin_id: string;
  bin_code: string;
  bin_path?: string;
  quantity: number;
  placed_at: string;
  removed_at?: string;
  removed_reason?: string;
  note?: string;
  listing_name?: string;
  listing_type?: string;
  listing_game?: string;
  listing_image?: string;
}

export async function listBins(): Promise<{ items: Bin[] }> {
  return fetchAPI("/api/v1/admin/bins");
}

export async function createBin(body: {
  code: string;
  label?: string | null;
  parent_bin_id?: string | null;
  kind: BinKind;
  capacity?: number | null;
  notes?: string | null;
}): Promise<Bin> {
  return fetchAPI("/api/v1/admin/bins", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateBin(id: string, body: Partial<Bin>): Promise<Bin> {
  return fetchAPI(`/api/v1/admin/bins/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function getBinByCode(code: string): Promise<Bin> {
  return fetchAPI(`/api/v1/admin/bins/by-code/${encodeURIComponent(code)}`);
}

export async function binContents(id: string): Promise<{ items: Placement[] }> {
  return fetchAPI(`/api/v1/admin/bins/${id}/contents`);
}

export async function placeListing(body: {
  listing_id: string;
  bin_id?: string;
  bin_code?: string;
  quantity?: number;
  note?: string | null;
}): Promise<Placement> {
  return fetchAPI("/api/v1/admin/placements", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function removePlacement(id: string, reason?: string): Promise<void> {
  return fetchAPI(`/api/v1/admin/placements/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });
}

export async function currentPlacement(listingID: string): Promise<Placement | null> {
  try {
    return await fetchAPI(`/api/v1/admin/listings/${listingID}/placement`);
  } catch (e) {
    if (e && typeof e === "object" && "status" in e && (e as { status: number }).status === 404) {
      return null;
    }
    throw e;
  }
}

export async function placementHistory(listingID: string): Promise<{ items: Placement[] }> {
  return fetchAPI(`/api/v1/admin/listings/${listingID}/placement/history`);
}

export interface SearchResult {
  bin: Bin | null;
  listings: {
    listing_id: string;
    name: string;
    type: string;
    game: string;
    image_url?: string;
    placement_id?: string;
    bin_id?: string;
    bin_code?: string;
    bin_path?: string;
    quantity?: number;
    placed_at?: string;
    note?: string;
  }[];
}

export async function whereIs(q: string): Promise<SearchResult> {
  return fetchAPI(`/api/v1/admin/storage/search?q=${encodeURIComponent(q)}`);
}

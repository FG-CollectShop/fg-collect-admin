import { fetchAPI } from "./client";

export type SourceType =
  | "collection_buy" | "estate" | "lgs" | "tcgplayer" | "ebay"
  | "auction_house" | "wholesale" | "trade" | "rip" | "gift" | "other";

export type AllocationMethod = "even" | "manual" | "weighted";

export interface Lot {
  id: string;
  name: string;
  source_type: SourceType;
  source_name?: string;
  source_contact?: string;
  acquired_at: string; // YYYY-MM-DD
  item_cost_cents: number;
  shipping_cents: number;
  fees_cents: number;
  other_cost_cents: number;
  currency: string;
  total_cost_cents: number;
  parent_listing_id?: string;
  allocation_method: AllocationMethod;
  notes?: string;
  closed: boolean;
  created_at: string;
  updated_at: string;
}

export type LotInput = Omit<Lot, "id" | "total_cost_cents" | "closed" | "created_at" | "updated_at">;

export async function listLots(open = false): Promise<{ items: Lot[] }> {
  return fetchAPI(`/api/v1/admin/lots${open ? "?open=true" : ""}`);
}

export async function getLot(id: string): Promise<Lot> {
  return fetchAPI(`/api/v1/admin/lots/${id}`);
}

export async function createLot(body: Partial<LotInput> & { name: string }): Promise<Lot> {
  return fetchAPI("/api/v1/admin/lots", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateLot(id: string, body: Partial<LotInput> & { closed?: boolean }): Promise<Lot> {
  return fetchAPI(`/api/v1/admin/lots/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function attachListings(lotID: string, listingIDs: string[]): Promise<{ attached: number }> {
  return fetchAPI(`/api/v1/admin/lots/${lotID}/attach`, {
    method: "POST",
    body: JSON.stringify({ listing_ids: listingIDs }),
  });
}

export async function detachListings(lotID: string, listingIDs: string[]): Promise<{ detached: number }> {
  return fetchAPI(`/api/v1/admin/lots/${lotID}/detach`, {
    method: "POST",
    body: JSON.stringify({ listing_ids: listingIDs }),
  });
}

export async function setListingCost(
  lotID: string,
  body: { listing_id: string; cost_cents?: number | null; weight?: number | null; note?: string | null },
): Promise<void> {
  return fetchAPI(`/api/v1/admin/lots/${lotID}/cost`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface RoiListing {
  listing_id: string;
  name: string;
  type: string;
  active: boolean;
  price_cents: number;
  allocated_cost_cents: number;
  sold_cents?: number;
  sold_quantity?: number;
  realized_gain_cents?: number;
}

export interface RoiReport {
  lot: Lot;
  item_count: number;
  sold_count: number;
  total_cost_cents: number;
  realized_revenue_cents: number;
  realized_gain_cents: number;
  outstanding_at_ask_cents: number;
  outstanding_at_cost_cents: number;
  listings: RoiListing[];
}

export async function lotRoi(id: string): Promise<RoiReport> {
  return fetchAPI(`/api/v1/admin/lots/${id}/roi`);
}

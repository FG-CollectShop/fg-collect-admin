import { fetchAPI } from './client';

export type ItemType =
  | 'sealed_display'
  | 'commander_deck'
  | 'booster_box'
  | 'booster_pack'
  | 'bundle'
  | 'prerelease_kit'
  | 'single'
  | 'graded'
  | 'other';

export type Platform = 'tcgplayer' | 'ebay' | 'lgs' | 'amazon' | 'facebook' | 'local' | 'other';

export interface Purchase {
  id: string;
  game: string;
  set_id?: string;
  set_name?: string;
  name: string;
  item_type: ItemType;
  tcgplayer_product_id?: number;
  image_url?: string;
  tcgplayer_url?: string;
  sealed_product_id?: string;
  card_id?: string;
  quantity: number;
  unit_cost_basis_cents: number;
  purchased_at: string;
  purchase_platform?: Platform;
  market_price_cents?: number;
  market_price_at?: string;
  notes?: string;
  created_at: string;
}

export interface InventoryItem extends Purchase {
  quantity_sold: number;
  quantity_on_hand: number;
  liquidation_cents?: number; // market * 0.85
  pl_cents?: number;          // market - cost_basis per unit
}

export interface Sale {
  id: string;
  purchase_id: string;
  quantity: number;
  unit_sale_price_cents: number;
  sold_at: string;
  sale_platform?: Platform;
  notes?: string;
  created_at: string;
}

export interface CreatePurchaseReq {
  game: string;
  set_id?: string;
  name: string;
  item_type: ItemType;
  tcgplayer_product_id?: number;
  sealed_product_id?: string;
  card_id?: string;
  quantity: number;
  unit_cost_basis_cents: number;
  purchased_at: string;
  purchase_platform?: Platform;
  market_price_cents?: number;
  notes?: string;
}

export interface RecordSaleReq {
  quantity: number;
  unit_sale_price_cents: number;
  sold_at: string;
  sale_platform?: Platform;
  notes?: string;
}

export async function listPurchases(game?: string): Promise<Purchase[]> {
  const params = game ? `?game=${game}` : '';
  const data = await fetchAPI<{ purchases: Purchase[] }>(`/api/v1/admin/purchases${params}`);
  return data.purchases;
}

export async function listInventory(game?: string): Promise<InventoryItem[]> {
  const params = game ? `?game=${game}` : '';
  const data = await fetchAPI<{ inventory: InventoryItem[] }>(`/api/v1/admin/inventory${params}`);
  return data.inventory;
}

export async function createPurchase(req: CreatePurchaseReq): Promise<{ id: string }> {
  return fetchAPI<{ id: string }>('/api/v1/admin/purchases', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function updatePurchase(
  id: string,
  patch: Partial<CreatePurchaseReq> & { market_price_cents?: number }
): Promise<void> {
  await fetchAPI(`/api/v1/admin/purchases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function deletePurchase(id: string): Promise<void> {
  await fetchAPI(`/api/v1/admin/purchases/${id}`, { method: 'DELETE' });
}

export async function recordSale(purchaseId: string, req: RecordSaleReq): Promise<{ id: string }> {
  return fetchAPI<{ id: string }>(`/api/v1/admin/purchases/${purchaseId}/sales`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function deleteSale(id: string): Promise<void> {
  await fetchAPI(`/api/v1/admin/sales/${id}`, { method: 'DELETE' });
}

export function tcgImageURL(productId: number): string {
  return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`;
}

export function tcgProductURL(productId: number): string {
  return `https://www.tcgplayer.com/product/${productId}`;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

import { fetchAPI } from './client';

export type ItemType =
  | 'sealed_display'
  | 'commander_deck'
  | 'booster_box'
  | 'booster_pack'
  | 'booster_bundle'
  | 'bundle'
  | 'prerelease_kit'
  | 'single'
  | 'graded'
  | 'elite_trainer_box'
  | 'pokemon_center_etb'
  | 'collector_booster_box'
  | 'collector_commander'
  | 'collection_box'
  | 'other';

export type Platform = string;

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
  xirr?: number;              // annualised return @ market
  xirr_liq?: number;          // annualised return @ liquidation (85% of market)
  sku_note?: string;          // shared note across purchases of same tcgplayer_product_id
  // Populated in SKU-rollup mode:
  lot_count?: number;         // number of lots rolled up
  platforms?: string[];       // distinct platforms across lots
  lot_ids?: string[];         // underlying purchase.id values
}

export type InventoryGroup = 'sku' | 'lot';

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

export async function listInventory(game?: string, group: InventoryGroup = 'sku'): Promise<InventoryItem[]> {
  const params = new URLSearchParams({ group });
  if (game) params.set('game', game);
  const data = await fetchAPI<{ inventory: InventoryItem[] }>(`/api/v1/admin/inventory?${params}`);
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

export interface ManifestSummary {
  cost_basis_cents: number;
  market_value_cents: number;
  liquidation_cents: number;
  portfolio_xirr: number | null;
  portfolio_xirr_liq: number | null;
  cash_flow_count: number;
}

export async function getManifestSummary(game?: string): Promise<ManifestSummary> {
  const params = game ? `?game=${game}` : '';
  return fetchAPI<ManifestSummary>(`/api/v1/admin/manifest/summary${params}`);
}

export type AnalyticsGroupBy = 'item_type' | 'game' | 'set' | 'purchase_platform';

export interface AnalyticsGroup {
  key: string;
  count: number;
  cost_basis_cents: number;
  market_value_cents: number;
  liquidation_cents: number;
  gain_market_pct?: number;
  gain_liq_pct?: number;
  xirr?: number;
  xirr_liq?: number;
  cash_flow_count: number;
}

export interface AnalyticsResponse {
  group_by: AnalyticsGroupBy;
  groups: AnalyticsGroup[];
}

export async function getManifestAnalytics(
  groupBy: AnalyticsGroupBy,
  game?: string,
): Promise<AnalyticsResponse> {
  const params = new URLSearchParams({ group_by: groupBy });
  if (game) params.set('game', game);
  return fetchAPI<AnalyticsResponse>(`/api/v1/admin/manifest/analytics?${params}`);
}

export async function getSKUNote(productId: number): Promise<string | null> {
  const data = await fetchAPI<{ note: string | null }>(`/api/v1/admin/skus/${productId}/note`);
  return data.note;
}

export async function putSKUNote(productId: number, note: string): Promise<void> {
  await fetchAPI(`/api/v1/admin/skus/${productId}/note`, {
    method: 'PUT',
    body: JSON.stringify({ note }),
  });
}

export interface SKUHistoryPoint {
  snapshot_date: string;      // YYYY-MM-DD (always 1st of month)
  market_price_cents: number;
  source: 'auto_snapshot' | 'manual' | 'tcgplayer_backfill';
  note?: string;
  quantity_on_hand: number;
  xirr?: number;
  xirr_liq?: number;
}

export async function getSKUHistory(productId: number): Promise<SKUHistoryPoint[]> {
  const data = await fetchAPI<{ history: SKUHistoryPoint[] }>(`/api/v1/admin/skus/${productId}/history`);
  return data.history;
}

export async function putSKUHistoryPoint(
  productId: number,
  yyyymm: string,
  marketPriceCents: number,
  note?: string,
): Promise<void> {
  await fetchAPI(`/api/v1/admin/skus/${productId}/history/${yyyymm}`, {
    method: 'PUT',
    body: JSON.stringify({ market_price_cents: marketPriceCents, note: note ?? '' }),
  });
}

export async function deleteSKUHistoryPoint(productId: number, yyyymm: string): Promise<void> {
  await fetchAPI(`/api/v1/admin/skus/${productId}/history/${yyyymm}`, { method: 'DELETE' });
}

export async function listPlatforms(): Promise<string[]> {
  const data = await fetchAPI<{ platforms: string[] }>('/api/v1/admin/purchases/platforms');
  return data.platforms;
}

export interface TCGProductLookup {
  product_id: number;
  name: string;
  set_name?: string;
  product_line?: string;
  market_price_cents?: number;
}

export async function lookupTCGProduct(productId: number): Promise<TCGProductLookup> {
  return fetchAPI<TCGProductLookup>(`/api/v1/admin/tcgplayer/product/${productId}`);
}

export async function refreshPrice(purchaseId: string): Promise<{ market_price_cents: number }> {
  return fetchAPI<{ market_price_cents: number }>(
    `/api/v1/admin/purchases/${purchaseId}/refresh-price`,
    { method: 'POST' }
  );
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

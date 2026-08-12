import { useState, useEffect, useCallback } from 'react';
import {
  listInventory, listPurchases, createPurchase, updatePurchase,
  deletePurchase, recordSale, refreshPrice,
  InventoryItem, Purchase, ItemType, Platform,
  formatCents,
} from '../api/manifest';

type Tab = 'inventory' | 'purchases';

const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: 'sealed_display',  label: 'Sealed Display' },
  { value: 'commander_deck',  label: 'Commander Deck' },
  { value: 'booster_box',     label: 'Booster Box' },
  { value: 'booster_pack',    label: 'Booster Pack' },
  { value: 'bundle',          label: 'Bundle' },
  { value: 'prerelease_kit',  label: 'Prerelease Kit' },
  { value: 'single',          label: 'Single Card' },
  { value: 'graded',          label: 'Graded Card' },
  { value: 'other',           label: 'Other' },
];

const PLATFORMS: Platform[] = ['tcgplayer', 'ebay', 'lgs', 'amazon', 'facebook', 'local', 'other'];

const today = () => new Date().toISOString().slice(0, 10);

function cents(val: string): number {
  return Math.round(parseFloat(val || '0') * 100);
}

function formatAge(isoStr: string): string {
  const ms = Date.now() - new Date(isoStr).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Add Purchase Form ─────────────────────────────────────────────────────────

function AddPurchaseForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    game: 'mtg',
    name: '',
    item_type: 'sealed_display' as ItemType,
    tcgplayer_product_id: '',
    quantity: '1',
    unit_cost_basis_cents: '',
    market_price_cents: '',
    purchased_at: today(),
    purchase_platform: '' as Platform | '',
    notes: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.unit_cost_basis_cents) return;
    setSaving(true);
    try {
      await createPurchase({
        game: form.game,
        name: form.name,
        item_type: form.item_type,
        tcgplayer_product_id: form.tcgplayer_product_id ? parseInt(form.tcgplayer_product_id) : undefined,
        quantity: parseInt(form.quantity) || 1,
        unit_cost_basis_cents: cents(form.unit_cost_basis_cents),
        market_price_cents: form.market_price_cents ? cents(form.market_price_cents) : undefined,
        purchased_at: form.purchased_at,
        purchase_platform: (form.purchase_platform as Platform) || undefined,
        notes: form.notes || undefined,
      });
      setOpen(false);
      setForm(f => ({ ...f, name: '', tcgplayer_product_id: '', quantity: '1', unit_cost_basis_cents: '', market_price_cents: '', notes: '' }));
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium"
      >
        + Add Purchase
      </button>
    );
  }

  const inputCls = "w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <form onSubmit={submit} className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">New Purchase</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className={labelCls}>Game</label>
          <select value={form.game} onChange={set('game')} className={inputCls}>
            <option value="mtg">MTG</option>
            <option value="pokemon">Pokémon</option>
            <option value="weiss">Weiss</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Type</label>
          <select value={form.item_type} onChange={set('item_type')} className={inputCls}>
            {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Date</label>
          <input type="date" value={form.purchased_at} onChange={set('purchased_at')} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Platform</label>
          <select value={form.purchase_platform} onChange={set('purchase_platform')} className={inputCls}>
            <option value="">—</option>
            {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelCls}>Name *</label>
          <input required value={form.name} onChange={set('name')} placeholder="e.g. Final Fantasy Commander Display" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>TCGPlayer Product ID</label>
          <input type="number" value={form.tcgplayer_product_id} onChange={set('tcgplayer_product_id')} placeholder="e.g. 618907" className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className={labelCls}>Qty *</label>
          <input required type="number" min="1" value={form.quantity} onChange={set('quantity')} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Cost Basis / unit *</label>
          <input required type="number" step="0.01" min="0" value={form.unit_cost_basis_cents} onChange={set('unit_cost_basis_cents')} placeholder="0.00" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Market Price / unit</label>
          <input type="number" step="0.01" min="0" value={form.market_price_cents} onChange={set('market_price_cents')} placeholder="auto-fetch via TCGPlayer ID" className={inputCls} />
        </div>
      </div>
      <div className="mb-3">
        <label className={labelCls}>Notes</label>
        <input value={form.notes} onChange={set('notes')} className={inputCls} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm font-medium">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-700 px-4 py-1.5 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Record Sale Modal ─────────────────────────────────────────────────────────

function RecordSaleModal({
  purchase,
  onClose,
  onSaved,
}: {
  purchase: Purchase | InventoryItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const available = 'quantity_on_hand' in purchase ? purchase.quantity_on_hand : purchase.quantity;
  const [form, setForm] = useState({
    quantity: '1',
    unit_sale_price_cents: purchase.market_price_cents ? String(purchase.market_price_cents / 100) : '',
    sold_at: today(),
    sale_platform: '' as Platform | '',
    notes: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await recordSale(purchase.id, {
        quantity: parseInt(form.quantity) || 1,
        unit_sale_price_cents: cents(form.unit_sale_price_cents),
        sold_at: form.sold_at,
        sale_platform: (form.sale_platform as Platform) || undefined,
        notes: form.notes || undefined,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg shadow-lg p-5 w-full max-w-md">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Record Sale</h3>
        <p className="text-xs text-gray-500 mb-4">{purchase.name} · {available} available</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelCls}>Qty *</label>
            <input required type="number" min="1" max={available} value={form.quantity} onChange={set('quantity')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Sale Price / unit *</label>
            <input required type="number" step="0.01" min="0" value={form.unit_sale_price_cents} onChange={set('unit_sale_price_cents')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={form.sold_at} onChange={set('sold_at')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Platform</label>
            <select value={form.sale_platform} onChange={set('sale_platform')} className={inputCls}>
              <option value="">—</option>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm font-medium">
            {saving ? 'Saving…' : 'Record Sale'}
          </button>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700 px-4 py-1.5 text-sm">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Market Price Cell ─────────────────────────────────────────────────────────

function MarketPriceCell({ item, onUpdated }: { item: InventoryItem | Purchase; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.market_price_cents ? String(item.market_price_cents / 100) : '');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updatePurchase(item.id, { market_price_cents: cents(val) });
      setEditing(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshPrice(item.id);
      onUpdated();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Price refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="number" step="0.01" min="0"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          className="w-24 border border-blue-400 rounded px-1 py-0.5 text-xs text-gray-900"
        />
        <button onClick={save} disabled={saving} className="text-green-600 hover:text-green-700 text-xs font-bold">{saving ? '…' : '✓'}</button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
      </div>
    );
  }

  const isStale = item.market_price_at
    ? Date.now() - new Date(item.market_price_at).getTime() > 24 * 3_600_000
    : false;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          className={`text-right hover:text-blue-600 transition-colors ${item.market_price_cents ? (isStale ? 'text-amber-600' : 'text-gray-800') : 'text-gray-400 text-xs'}`}
        >
          {item.market_price_cents ? formatCents(item.market_price_cents) : '— set price'}
        </button>
        {item.tcgplayer_product_id != null && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh from TCGPlayer"
            className="text-gray-400 hover:text-blue-500 disabled:opacity-40 text-sm leading-none"
          >
            {refreshing ? '…' : '↻'}
          </button>
        )}
      </div>
      {item.market_price_at && (
        <span className={`text-xs ${isStale ? 'text-amber-500' : 'text-gray-400'}`}>
          {formatAge(item.market_price_at)}
        </span>
      )}
    </div>
  );
}

// ── Inventory Table ───────────────────────────────────────────────────────────

function InventoryTable({ items, onRefresh }: { items: InventoryItem[]; onRefresh: () => void }) {
  const [selling, setSelling] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm('Delete this purchase? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await deletePurchase(id);
      onRefresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-gray-400 text-sm py-8 text-center">No inventory yet — add a purchase above.</p>;
  }

  return (
    <>
      {selling && (
        <RecordSaleModal purchase={selling} onClose={() => setSelling(null)} onSaved={onRefresh} />
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
              <th className="pb-2 pr-3 font-medium">Item</th>
              <th className="pb-2 pr-3 font-medium text-right">Qty</th>
              <th className="pb-2 pr-3 font-medium text-right">Cost Basis</th>
              <th className="pb-2 pr-3 font-medium text-right">Market</th>
              <th className="pb-2 pr-3 font-medium text-right">Liquidation</th>
              <th className="pb-2 pr-3 font-medium text-right">P&amp;L</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map(item => {
              const plColor = item.pl_cents == null ? 'text-gray-400' : item.pl_cents >= 0 ? 'text-green-600' : 'text-red-500';
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-3">
                      {item.image_url ? (
                        <a href={item.tcgplayer_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <img src={item.image_url} alt={item.name} className="w-12 h-12 object-contain rounded border border-gray-100" />
                        </a>
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-gray-400 text-xs shrink-0">?</div>
                      )}
                      <div>
                        <div className="font-medium text-gray-900">
                          {item.tcgplayer_url ? (
                            <a href={item.tcgplayer_url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">{item.name}</a>
                          ) : item.name}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {item.set_name ?? item.game} · {item.item_type.replace(/_/g, ' ')}
                          {item.purchase_platform && <span className="ml-1 text-gray-400">· {item.purchase_platform}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-right text-gray-700">
                    <div className="font-medium">{item.quantity_on_hand}</div>
                    {item.quantity_sold > 0 && <div className="text-xs text-gray-400">{item.quantity_sold} sold</div>}
                  </td>
                  <td className="py-3 pr-3 text-right text-gray-700">{formatCents(item.unit_cost_basis_cents)}</td>
                  <td className="py-3 pr-3 text-right">
                    <MarketPriceCell item={item} onUpdated={onRefresh} />
                  </td>
                  <td className="py-3 pr-3 text-right font-medium text-amber-600">
                    {item.liquidation_cents != null ? formatCents(item.liquidation_cents) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`py-3 pr-3 text-right font-semibold ${plColor}`}>
                    {item.pl_cents != null ? (item.pl_cents >= 0 ? '+' : '') + formatCents(item.pl_cents) : '—'}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => setSelling(item)}
                        className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-2 py-0.5 rounded"
                      >
                        Sell
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deleting === item.id}
                        className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Purchases Table ───────────────────────────────────────────────────────────

function PurchasesTable({ items, onRefresh }: { items: Purchase[]; onRefresh: () => void }) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm('Delete this purchase? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await deletePurchase(id);
      onRefresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-gray-400 text-sm py-8 text-center">No purchases recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
            <th className="pb-2 pr-3 font-medium">Item</th>
            <th className="pb-2 pr-3 font-medium text-right">Qty</th>
            <th className="pb-2 pr-3 font-medium text-right">Cost / unit</th>
            <th className="pb-2 pr-3 font-medium text-right">Total Paid</th>
            <th className="pb-2 pr-3 font-medium">Date</th>
            <th className="pb-2 pr-3 font-medium">Platform</th>
            <th className="pb-2 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map(item => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="py-3 pr-3">
                <div className="flex items-center gap-3">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-10 h-10 object-contain rounded border border-gray-100 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-100 rounded border border-gray-200 shrink-0" />
                  )}
                  <div>
                    <div className="font-medium text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.set_name ?? item.game} · {item.item_type.replace(/_/g, ' ')}</div>
                  </div>
                </div>
              </td>
              <td className="py-3 pr-3 text-right text-gray-700">{item.quantity}</td>
              <td className="py-3 pr-3 text-right text-gray-600">{formatCents(item.unit_cost_basis_cents)}</td>
              <td className="py-3 pr-3 text-right font-medium text-gray-800">{formatCents(item.unit_cost_basis_cents * item.quantity)}</td>
              <td className="py-3 pr-3 text-gray-600">{item.purchased_at}</td>
              <td className="py-3 pr-3 text-gray-500 text-xs">{item.purchase_platform ?? '—'}</td>
              <td className="py-3">
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={deleting === item.id}
                  className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                >
                  Del
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ManifestPage() {
  const [tab, setTab] = useState<Tab>('inventory');
  const [game, setGame] = useState('mtg');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'inventory') {
        setInventory(await listInventory(game));
      } else {
        setPurchases(await listPurchases(game));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab, game]);

  useEffect(() => { load(); }, [load]);

  const totalCost = inventory.reduce((s, i) => s + i.unit_cost_basis_cents * i.quantity_on_hand, 0);
  const totalMarket = inventory.reduce((s, i) => s + (i.market_price_cents ?? 0) * i.quantity_on_hand, 0);
  const totalLiquidation = inventory.reduce((s, i) => s + (i.liquidation_cents ?? 0) * i.quantity_on_hand, 0);
  const hasMarket = inventory.some(i => i.market_price_cents != null);
  const totalPL = hasMarket ? totalMarket - totalCost : null;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Manifest</h1>
          <p className="text-xs text-gray-500 mt-0.5">Purchase &amp; sale ledger · inventory is derived</p>
        </div>
        <select
          value={game}
          onChange={e => setGame(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="mtg">MTG</option>
          <option value="pokemon">Pokémon</option>
          <option value="weiss">Weiss</option>
          <option value="">All games</option>
        </select>
      </div>

      {/* Summary cards */}
      {tab === 'inventory' && !loading && inventory.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">Cost Basis</div>
            <div className="text-lg font-bold text-gray-900">{formatCents(totalCost)}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">Market Value</div>
            <div className={`text-lg font-bold ${hasMarket ? 'text-gray-900' : 'text-gray-300'}`}>
              {hasMarket ? formatCents(totalMarket) : '—'}
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">Liquidation <span className="text-gray-400">(85%)</span></div>
            <div className={`text-lg font-bold ${hasMarket ? 'text-amber-600' : 'text-gray-300'}`}>
              {hasMarket ? formatCents(totalLiquidation) : '—'}
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">Unrealized P&amp;L</div>
            <div className={`text-lg font-bold ${totalPL == null ? 'text-gray-300' : totalPL >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {totalPL != null ? (totalPL >= 0 ? '+' : '') + formatCents(totalPL) : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Add purchase */}
      <AddPurchaseForm onAdded={load} />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 mt-4 border-b border-gray-200">
        {(['inventory', 'purchases'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'inventory' ? 'Inventory' : 'All Purchases'}
          </button>
        ))}
      </div>

      {/* Content */}
      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : tab === 'inventory' ? (
        <InventoryTable items={inventory} onRefresh={load} />
      ) : (
        <PurchasesTable items={purchases} onRefresh={load} />
      )}
    </div>
  );
}

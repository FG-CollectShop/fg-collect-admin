import { useState, useEffect, useCallback } from 'react';
import {
  listInventory, listPurchases, createPurchase, updatePurchase,
  deletePurchase, recordSale,
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

  return (
    <form onSubmit={submit} className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-200 mb-3">New Purchase</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Game</label>
          <select value={form.game} onChange={set('game')} className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100">
            <option value="mtg">MTG</option>
            <option value="pokemon">Pokémon</option>
            <option value="weiss">Weiss</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Type</label>
          <select value={form.item_type} onChange={set('item_type')} className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100">
            {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Date</label>
          <input type="date" value={form.purchased_at} onChange={set('purchased_at')} className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Platform</label>
          <select value={form.purchase_platform} onChange={set('purchase_platform')} className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100">
            <option value="">—</option>
            {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Name *</label>
          <input required value={form.name} onChange={set('name')} placeholder="e.g. Final Fantasy Commander Display" className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">TCGPlayer Product ID</label>
          <input type="number" value={form.tcgplayer_product_id} onChange={set('tcgplayer_product_id')} placeholder="e.g. 618907" className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Qty *</label>
          <input required type="number" min="1" value={form.quantity} onChange={set('quantity')} className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Cost Basis / unit *</label>
          <input required type="number" step="0.01" min="0" value={form.unit_cost_basis_cents} onChange={set('unit_cost_basis_cents')} placeholder="0.00" className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Market Price / unit</label>
          <input type="number" step="0.01" min="0" value={form.market_price_cents} onChange={set('market_price_cents')} placeholder="0.00" className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100" />
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-xs text-gray-400 mb-1">Notes</label>
        <input value={form.notes} onChange={set('notes')} className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100" />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm font-medium">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-200 px-4 py-1.5 text-sm">
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <form onSubmit={submit} className="bg-gray-800 border border-gray-700 rounded-lg p-5 w-full max-w-md">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">Record Sale</h3>
        <p className="text-xs text-gray-400 mb-4">{purchase.name} · {available} available</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Qty *</label>
            <input required type="number" min="1" max={available} value={form.quantity} onChange={set('quantity')}
              className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Sale Price / unit *</label>
            <input required type="number" step="0.01" min="0" value={form.unit_sale_price_cents} onChange={set('unit_sale_price_cents')}
              className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Date</label>
            <input type="date" value={form.sold_at} onChange={set('sold_at')}
              className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Platform</label>
            <select value={form.sale_platform} onChange={set('sale_platform')}
              className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-100">
              <option value="">—</option>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm font-medium">
            {saving ? 'Saving…' : 'Record Sale'}
          </button>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-200 px-4 py-1.5 text-sm">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Market Price Inline Edit ──────────────────────────────────────────────────

function MarketPriceCell({ item, onUpdated }: { item: InventoryItem | Purchase; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.market_price_cents ? String(item.market_price_cents / 100) : '');
  const [saving, setSaving] = useState(false);

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

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="number" step="0.01" min="0"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          className="w-24 bg-gray-900 border border-blue-500 rounded px-1 py-0.5 text-xs text-gray-100"
        />
        <button onClick={save} disabled={saving} className="text-green-400 hover:text-green-300 text-xs">{saving ? '…' : '✓'}</button>
        <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
      </div>
    );
  }

  return (
    <button onClick={() => setEditing(true)} className="text-left hover:text-blue-400 transition-colors">
      {item.market_price_cents ? formatCents(item.market_price_cents) : <span className="text-gray-600 text-xs">— set</span>}
    </button>
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
    return <p className="text-gray-500 text-sm py-8 text-center">No inventory yet — add a purchase above.</p>;
  }

  return (
    <>
      {selling && (
        <RecordSaleModal purchase={selling} onClose={() => setSelling(null)} onSaved={onRefresh} />
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
              <th className="pb-2 pr-3 font-medium">Item</th>
              <th className="pb-2 pr-3 font-medium text-right">Qty</th>
              <th className="pb-2 pr-3 font-medium text-right">Cost Basis</th>
              <th className="pb-2 pr-3 font-medium text-right">Market</th>
              <th className="pb-2 pr-3 font-medium text-right">Liquidation</th>
              <th className="pb-2 pr-3 font-medium text-right">P&amp;L</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {items.map(item => {
              const plColor = item.pl_cents == null ? '' : item.pl_cents >= 0 ? 'text-green-400' : 'text-red-400';
              return (
                <tr key={item.id} className="hover:bg-gray-800/40">
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-3">
                      {item.image_url ? (
                        <a href={item.tcgplayer_url} target="_blank" rel="noopener noreferrer">
                          <img src={item.image_url} alt={item.name} className="w-10 h-10 object-contain rounded" />
                        </a>
                      ) : (
                        <div className="w-10 h-10 bg-gray-700 rounded flex items-center justify-center text-gray-500 text-xs">?</div>
                      )}
                      <div>
                        <div className="font-medium text-gray-100">
                          {item.tcgplayer_url ? (
                            <a href={item.tcgplayer_url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">{item.name}</a>
                          ) : item.name}
                        </div>
                        <div className="text-xs text-gray-500">{item.set_name ?? item.game} · {item.item_type.replace('_', ' ')}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-right text-gray-200">
                    <div>{item.quantity_on_hand}</div>
                    {item.quantity_sold > 0 && <div className="text-xs text-gray-600">{item.quantity_sold} sold</div>}
                  </td>
                  <td className="py-3 pr-3 text-right text-gray-300">{formatCents(item.unit_cost_basis_cents)}</td>
                  <td className="py-3 pr-3 text-right">
                    <MarketPriceCell item={item} onUpdated={onRefresh} />
                  </td>
                  <td className="py-3 pr-3 text-right text-yellow-400">
                    {item.liquidation_cents != null ? formatCents(item.liquidation_cents) : '—'}
                  </td>
                  <td className={`py-3 pr-3 text-right font-medium ${plColor}`}>
                    {item.pl_cents != null ? (item.pl_cents >= 0 ? '+' : '') + formatCents(item.pl_cents) : '—'}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelling(item)}
                        className="text-xs text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 px-2 py-0.5 rounded"
                      >
                        Sell
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deleting === item.id}
                        className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50"
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
    return <p className="text-gray-500 text-sm py-8 text-center">No purchases recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700">
            <th className="pb-2 pr-3 font-medium">Item</th>
            <th className="pb-2 pr-3 font-medium text-right">Qty</th>
            <th className="pb-2 pr-3 font-medium text-right">Cost Basis</th>
            <th className="pb-2 pr-3 font-medium text-right">Total Paid</th>
            <th className="pb-2 pr-3 font-medium">Date</th>
            <th className="pb-2 pr-3 font-medium">Platform</th>
            <th className="pb-2 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {items.map(item => (
            <tr key={item.id} className="hover:bg-gray-800/40">
              <td className="py-3 pr-3">
                <div className="flex items-center gap-3">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-8 h-8 object-contain rounded" />
                  ) : (
                    <div className="w-8 h-8 bg-gray-700 rounded" />
                  )}
                  <div>
                    <div className="font-medium text-gray-100">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.set_name ?? item.game} · {item.item_type.replace('_', ' ')}</div>
                  </div>
                </div>
              </td>
              <td className="py-3 pr-3 text-right text-gray-200">{item.quantity}</td>
              <td className="py-3 pr-3 text-right text-gray-300">{formatCents(item.unit_cost_basis_cents)}</td>
              <td className="py-3 pr-3 text-right text-gray-300 font-medium">{formatCents(item.unit_cost_basis_cents * item.quantity)}</td>
              <td className="py-3 pr-3 text-gray-400">{item.purchased_at}</td>
              <td className="py-3 pr-3 text-gray-500 text-xs">{item.purchase_platform ?? '—'}</td>
              <td className="py-3">
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={deleting === item.id}
                  className="text-xs text-red-500 hover:text-red-400 disabled:opacity-50"
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

  // Summary stats for inventory tab
  const totalCost = inventory.reduce((s, i) => s + i.unit_cost_basis_cents * i.quantity_on_hand, 0);
  const totalMarket = inventory.reduce((s, i) => s + (i.market_price_cents ?? 0) * i.quantity_on_hand, 0);
  const totalLiquidation = inventory.reduce((s, i) => s + (i.liquidation_cents ?? 0) * i.quantity_on_hand, 0);
  const hasMarket = inventory.some(i => i.market_price_cents != null);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Manifest</h1>
          <p className="text-xs text-gray-500 mt-0.5">Purchase & sale ledger · inventory is derived</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={game}
            onChange={e => setGame(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100"
          >
            <option value="mtg">MTG</option>
            <option value="pokemon">Pokémon</option>
            <option value="weiss">Weiss</option>
            <option value="">All games</option>
          </select>
        </div>
      </div>

      {/* Inventory summary cards */}
      {tab === 'inventory' && !loading && inventory.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Total Cost Basis</div>
            <div className="text-lg font-bold text-gray-100">{formatCents(totalCost)}</div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Market Value</div>
            <div className={`text-lg font-bold ${hasMarket ? 'text-gray-100' : 'text-gray-600'}`}>
              {hasMarket ? formatCents(totalMarket) : '—'}
            </div>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Liquidation Value <span className="text-gray-600">(85%)</span></div>
            <div className={`text-lg font-bold ${hasMarket ? 'text-yellow-400' : 'text-gray-600'}`}>
              {hasMarket ? formatCents(totalLiquidation) : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Add purchase form */}
      <AddPurchaseForm onAdded={load} />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 mt-4 border-b border-gray-700">
        {(['inventory', 'purchases'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'inventory' ? 'Inventory' : 'All Purchases'}
          </button>
        ))}
      </div>

      {/* Content */}
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : tab === 'inventory' ? (
        <InventoryTable items={inventory} onRefresh={load} />
      ) : (
        <PurchasesTable items={purchases} onRefresh={load} />
      )}
    </div>
  );
}

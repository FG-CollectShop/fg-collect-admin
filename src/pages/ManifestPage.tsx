import { useState, useEffect, useCallback } from 'react';
import {
  listInventory, listPurchases, listPlatforms, getManifestSummary, getManifestAnalytics,
  createPurchase, updatePurchase, deletePurchase, recordSale, refreshPrice, putSKUNote,
  lookupTCGProduct, getSKUHistory, putSKUHistoryPoint, deleteSKUHistoryPoint,
  InventoryItem, Purchase, ManifestSummary, AnalyticsGroup, AnalyticsGroupBy, InventoryGroup,
  SKUHistoryPoint, ItemType, Platform, formatCents,
} from '../api/manifest';

type Tab = 'inventory' | 'purchases' | 'analytics';

const GROUP_BY_OPTIONS: { value: AnalyticsGroupBy; label: string }[] = [
  { value: 'item_type',         label: 'Item Type' },
  { value: 'game',              label: 'Game' },
  { value: 'set',               label: 'Set' },
  { value: 'purchase_platform', label: 'Platform' },
];

const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: 'booster_box',           label: 'Booster Box' },
  { value: 'booster_pack',          label: 'Booster Pack' },
  { value: 'sealed_display',        label: 'Sealed Display' },
  { value: 'elite_trainer_box',     label: 'Elite Trainer Box' },
  { value: 'pokemon_center_etb',    label: 'Pokemon Center ETB' },
  { value: 'collector_booster_box', label: 'Collector Booster Box' },
  { value: 'collector_commander',   label: 'Collector Commander' },
  { value: 'collection_box',        label: 'Collection Box' },
  { value: 'commander_deck',        label: 'Commander Deck' },
  { value: 'bundle',                label: 'Bundle' },
  { value: 'prerelease_kit',        label: 'Prerelease Kit' },
  { value: 'single',                label: 'Single Card' },
  { value: 'graded',                label: 'Graded Card' },
  { value: 'other',                 label: 'Other' },
];

const DEFAULT_PLATFORMS = ['tcgplayer', 'ebay', 'lgs', 'amazon', 'facebook', 'local', 'other'];

// Maps TCGPlayer productLineName → our internal game code.
// Empty match falls through and the game field stays untouched.
const PRODUCT_LINE_TO_GAME: Record<string, string> = {
  'pokemon':               'pokemon',
  'magic':                 'mtg',
  'yugioh':                'yugioh',
  'weiss schwarz':         'weiss',
  'lorcana':               'lorcana',
  'one piece card game':   'one_piece',
  'riftbound':             'riftbound',
  'gundam':                'gundam',
  'gundam card game':      'gundam',
};

function gameFromProductLine(line: string | undefined): string | null {
  if (!line) return null;
  return PRODUCT_LINE_TO_GAME[line.toLowerCase()] ?? null;
}

const GAMES: { value: string; label: string }[] = [
  { value: 'mtg',       label: 'MTG' },
  { value: 'pokemon',   label: 'Pokémon' },
  { value: 'weiss',     label: 'Weiss' },
  { value: 'lorcana',   label: 'Lorcana' },
  { value: 'one_piece', label: 'One Piece' },
  { value: 'yugioh',    label: 'Yu-Gi-Oh!' },
  { value: 'riftbound', label: 'Riftbound' },
  { value: 'gundam',    label: 'Gundam' },
  { value: 'other',     label: 'Other' },
];

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

function AddPurchaseForm({ onAdded, platforms }: { onAdded: () => void; platforms: string[] }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
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

  async function lookupProduct() {
    const raw = form.tcgplayer_product_id.trim();
    if (!raw) return;
    const pid = parseInt(raw, 10);
    if (isNaN(pid) || pid <= 0) return;
    setLookupErr(null);
    setLookingUp(true);
    try {
      const data = await lookupTCGProduct(pid);
      setForm(f => {
        const nextGame = gameFromProductLine(data.product_line);
        return {
          ...f,
          // Only fill fields the user hasn't already typed into.
          name: f.name.trim() === '' ? data.name : f.name,
          game: nextGame && (f.game === 'mtg' || f.game === '') ? nextGame : f.game,
          market_price_cents: f.market_price_cents.trim() === '' && data.market_price_cents
            ? (data.market_price_cents / 100).toFixed(2)
            : f.market_price_cents,
        };
      });
    } catch (e) {
      setLookupErr(e instanceof Error ? e.message : 'Lookup failed');
      setTimeout(() => setLookupErr(null), 5000);
    } finally {
      setLookingUp(false);
    }
  }

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
            {GAMES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
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
          <input
            list="platform-suggestions"
            value={form.purchase_platform}
            onChange={set('purchase_platform')}
            placeholder="e.g. tcgplayer"
            className={inputCls}
          />
          <datalist id="platform-suggestions">
            {platforms.map(p => <option key={p} value={p} />)}
          </datalist>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelCls}>Name *</label>
          <input required value={form.name} onChange={set('name')} placeholder="e.g. Final Fantasy Commander Display" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>
            TCGPlayer Product ID
            {lookingUp && <span className="ml-2 text-blue-500 font-normal">looking up…</span>}
            {lookupErr && <span className="ml-2 text-red-500 font-normal">{lookupErr}</span>}
          </label>
          <input
            type="number"
            value={form.tcgplayer_product_id}
            onChange={set('tcgplayer_product_id')}
            onBlur={lookupProduct}
            placeholder="e.g. 618907 — auto-fills name + price"
            className={inputCls}
          />
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
  platforms,
}: {
  purchase: Purchase | InventoryItem;
  onClose: () => void;
  onSaved: () => void;
  platforms: string[];
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
            <input
              list="sale-platform-suggestions"
              value={form.sale_platform}
              onChange={set('sale_platform')}
              placeholder="e.g. ebay"
              className={inputCls}
            />
            <datalist id="sale-platform-suggestions">
              {platforms.map(p => <option key={p} value={p} />)}
            </datalist>
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

  const [refreshErr, setRefreshErr] = useState<string | null>(null);

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshErr(null);
    try {
      await refreshPrice(item.id);
      onUpdated();
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'Refresh unavailable';
      setRefreshErr(msg);
      setTimeout(() => setRefreshErr(null), 4000);
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
      {refreshErr && <span className="text-xs text-red-500">{refreshErr}</span>}
      {!refreshErr && item.market_price_at && (
        <span className={`text-xs ${isStale ? 'text-amber-500' : 'text-gray-400'}`}>
          {formatAge(item.market_price_at)}
        </span>
      )}
    </div>
  );
}

// ── Platform Cell ─────────────────────────────────────────────────────────────

function PlatformCell({ item, platforms, onUpdated }: {
  item: Purchase | InventoryItem;
  platforms: string[];
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.purchase_platform ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updatePurchase(item.id, { purchase_platform: val || undefined });
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
          list="platform-cell-suggestions"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(item.purchase_platform ?? ''); setEditing(false); } }}
          onBlur={save}
          placeholder="platform"
          className="w-28 border border-blue-400 rounded px-1 py-0.5 text-xs text-gray-900"
        />
        <datalist id="platform-cell-suggestions">
          {platforms.map(p => <option key={p} value={p} />)}
        </datalist>
        {saving && <span className="text-xs text-gray-400">…</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-left hover:text-blue-600 transition-colors text-gray-500"
    >
      {item.purchase_platform ?? <span className="text-gray-300">—</span>}
    </button>
  );
}

// ── Edit Purchase Modal ───────────────────────────────────────────────────────

function EditPurchaseModal({
  purchase,
  platforms,
  onClose,
  onSaved,
}: {
  purchase: Purchase | InventoryItem;
  platforms: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: purchase.name,
    item_type: purchase.item_type,
    tcgplayer_product_id: purchase.tcgplayer_product_id ? String(purchase.tcgplayer_product_id) : '',
    quantity: String(purchase.quantity),
    unit_cost_basis_cents: (purchase.unit_cost_basis_cents / 100).toFixed(2),
    purchased_at: purchase.purchased_at,
    purchase_platform: purchase.purchase_platform ?? '',
    notes: purchase.notes ?? '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updatePurchase(purchase.id, {
        name: form.name,
        item_type: form.item_type as ItemType,
        tcgplayer_product_id: form.tcgplayer_product_id ? parseInt(form.tcgplayer_product_id) : undefined,
        quantity: parseInt(form.quantity) || 1,
        unit_cost_basis_cents: cents(form.unit_cost_basis_cents),
        purchased_at: form.purchased_at,
        purchase_platform: form.purchase_platform || undefined,
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg shadow-lg p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Edit Purchase</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div className="md:col-span-2">
            <label className={labelCls}>Name *</label>
            <input required value={form.name} onChange={set('name')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <select value={form.item_type} onChange={set('item_type')} className={inputCls}>
              {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>TCGPlayer Product ID</label>
            <input type="number" value={form.tcgplayer_product_id} onChange={set('tcgplayer_product_id')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Qty *</label>
            <input required type="number" min="1" value={form.quantity} onChange={set('quantity')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Cost Basis / unit *</label>
            <input required type="number" step="0.01" min="0" value={form.unit_cost_basis_cents} onChange={set('unit_cost_basis_cents')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Purchase Date</label>
            <input type="date" value={form.purchased_at} onChange={set('purchased_at')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Platform</label>
            <input list="edit-platform-suggestions" value={form.purchase_platform} onChange={set('purchase_platform')} className={inputCls} />
            <datalist id="edit-platform-suggestions">
              {platforms.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Purchase Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={3} className={inputCls} placeholder="Free-text — anything about this specific purchase (seller, condition, receipt #, etc.)" />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm font-medium">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700 px-4 py-1.5 text-sm">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ── SKU Note Cell (shared across purchases of same product_id) ───────────────

function SKUNoteCell({ item, onUpdated }: { item: InventoryItem; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.sku_note ?? '');
  const [saving, setSaving] = useState(false);

  if (item.tcgplayer_product_id == null) {
    return <span className="text-xs text-gray-300">—</span>;
  }

  async function save() {
    setSaving(true);
    try {
      await putSKUNote(item.tcgplayer_product_id!, val);
      setEditing(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <textarea
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') { setVal(item.sku_note ?? ''); setEditing(false); } }}
          rows={2}
          className="w-full border border-blue-400 rounded px-1 py-0.5 text-xs text-gray-900"
          placeholder="SKU note (shared across purchases)"
        />
        <div className="flex gap-1">
          <button onClick={save} disabled={saving} className="text-green-600 hover:text-green-700 text-xs font-bold">{saving ? '…' : '✓'}</button>
          <button onClick={() => { setVal(item.sku_note ?? ''); setEditing(false); }} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-left hover:text-blue-600 transition-colors text-gray-600 max-w-[180px] whitespace-normal"
    >
      {item.sku_note || <span className="text-gray-300">+ add note</span>}
    </button>
  );
}

// ── SKU History Modal (market + XIRR over time) ──────────────────────────────

function HistoryChart({ points }: { points: SKUHistoryPoint[] }) {
  const withData = points.filter(p => p.market_price_cents > 0);
  if (withData.length < 1) {
    return <p className="text-gray-400 text-sm py-8 text-center">No history yet — snapshots accrue monthly.</p>;
  }

  // SVG chart geometry.
  const W = 640, H = 240, padL = 50, padR = 50, padT = 12, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const times = withData.map(p => new Date(p.snapshot_date).getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const tSpan = tMax - tMin || 1;

  const marketVals = withData.map(p => p.market_price_cents / 100);
  const mMin = Math.min(...marketVals);
  const mMax = Math.max(...marketVals);
  const mPad = (mMax - mMin) * 0.15 || mMax * 0.15 || 1;
  const mLo = Math.max(0, mMin - mPad);
  const mHi = mMax + mPad;

  const xirrVals = withData.filter(p => p.xirr != null).map(p => (p.xirr as number) * 100);
  const hasXIRR = xirrVals.length > 0;
  const xMin = hasXIRR ? Math.min(...xirrVals, 0) : 0;
  const xMax = hasXIRR ? Math.max(...xirrVals, 0) : 100;
  const xPad = Math.max((xMax - xMin) * 0.15, 5);
  const xLo = xMin - xPad;
  const xHi = xMax + xPad;

  const px = (t: number) => padL + ((t - tMin) / tSpan) * innerW;
  const pyM = (v: number) => padT + (1 - (v - mLo) / (mHi - mLo)) * innerH;
  const pyX = (v: number) => padT + (1 - (v - xLo) / (xHi - xLo)) * innerH;

  const marketPath = withData
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${px(new Date(p.snapshot_date).getTime())},${pyM(p.market_price_cents / 100)}`)
    .join(' ');

  const xirrPoints = withData.filter(p => p.xirr != null);
  const xirrPath = xirrPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${px(new Date(p.snapshot_date).getTime())},${pyX((p.xirr as number) * 100)}`)
    .join(' ');

  const fmtDate = (t: number) => new Date(t).toISOString().slice(0, 7);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 280 }}>
      {/* Y grid lines (market) */}
      {[0, 0.25, 0.5, 0.75, 1].map(f => {
        const y = padT + f * innerH;
        const v = mHi - f * (mHi - mLo);
        return (
          <g key={`ml${f}`}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e5e7eb" strokeDasharray="2,3" />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#6b7280">
              ${v.toFixed(0)}
            </text>
          </g>
        );
      })}
      {/* Right Y axis (XIRR) */}
      {hasXIRR && [0, 0.25, 0.5, 0.75, 1].map(f => {
        const y = padT + f * innerH;
        const v = xHi - f * (xHi - xLo);
        return (
          <text key={`xl${f}`} x={W - padR + 6} y={y + 3} textAnchor="start" fontSize="10" fill="#2563eb">
            {v.toFixed(0)}%
          </text>
        );
      })}
      {/* X axis labels */}
      {withData.map((p, i) => {
        if (i % Math.max(1, Math.floor(withData.length / 6)) !== 0 && i !== withData.length - 1) return null;
        const t = new Date(p.snapshot_date).getTime();
        return (
          <text key={`xa${i}`} x={px(t)} y={H - 10} textAnchor="middle" fontSize="10" fill="#6b7280">
            {fmtDate(t)}
          </text>
        );
      })}
      {/* Market line */}
      <path d={marketPath} stroke="#d97706" strokeWidth="2" fill="none" />
      {withData.map((p, i) => (
        <circle key={`mp${i}`} cx={px(new Date(p.snapshot_date).getTime())} cy={pyM(p.market_price_cents / 100)}
                r="3" fill={p.source === 'manual' ? '#fff' : '#d97706'} stroke="#d97706" strokeWidth="1.5">
          <title>{p.snapshot_date}: ${(p.market_price_cents / 100).toFixed(2)} ({p.source}){p.xirr != null ? ` · XIRR ${(p.xirr * 100).toFixed(1)}%` : ''}</title>
        </circle>
      ))}
      {/* XIRR line */}
      {hasXIRR && (
        <>
          <path d={xirrPath} stroke="#2563eb" strokeWidth="2" fill="none" strokeDasharray="4,2" />
          {xirrPoints.map((p, i) => (
            <circle key={`xp${i}`} cx={px(new Date(p.snapshot_date).getTime())} cy={pyX((p.xirr as number) * 100)}
                    r="2.5" fill="#2563eb">
              <title>{p.snapshot_date}: XIRR {((p.xirr as number) * 100).toFixed(1)}%</title>
            </circle>
          ))}
        </>
      )}
      {/* Legend */}
      <g transform={`translate(${padL},${padT})`}>
        <rect x="0" y="0" width="10" height="10" fill="#d97706" />
        <text x="14" y="9" fontSize="10" fill="#374151">Market $</text>
        {hasXIRR && (
          <>
            <line x1="80" y1="5" x2="94" y2="5" stroke="#2563eb" strokeWidth="2" strokeDasharray="4,2" />
            <text x="98" y="9" fontSize="10" fill="#374151">XIRR %</text>
          </>
        )}
      </g>
    </svg>
  );
}

function SKUHistoryModal({
  productId,
  itemName,
  onClose,
}: {
  productId: number;
  itemName: string;
  onClose: () => void;
}) {
  const [points, setPoints] = useState<SKUHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [addMonth, setAddMonth] = useState(''); // YYYY-MM
  const [addPrice, setAddPrice] = useState('');
  const [addNote, setAddNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPoints(await getSKUHistory(productId));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  async function addOrUpdate() {
    if (!addMonth || !addPrice) return;
    setSaving(true);
    try {
      await putSKUHistoryPoint(productId, addMonth, Math.round(parseFloat(addPrice) * 100), addNote || undefined);
      setAddMonth(''); setAddPrice(''); setAddNote('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(snapshotDate: string) {
    if (!confirm(`Delete history point for ${snapshotDate}?`)) return;
    await deleteSKUHistoryPoint(productId, snapshotDate.slice(0, 7));
    await load();
  }

  const inputCls = "w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-5 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Price + XIRR History</h3>
            <p className="text-xs text-gray-500 mt-0.5">{itemName} · TCGPlayer #{productId}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm py-8 text-center">Loading…</p>
        ) : (
          <>
            <HistoryChart points={points} />

            <div className="mt-5 border-t border-gray-200 pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Add / Edit Month</h4>
              <div className="grid grid-cols-4 gap-2 mb-3">
                <input type="month" value={addMonth} onChange={e => setAddMonth(e.target.value)} className={inputCls} />
                <input type="number" step="0.01" placeholder="$ price" value={addPrice} onChange={e => setAddPrice(e.target.value)} className={inputCls} />
                <input type="text" placeholder="note (optional)" value={addNote} onChange={e => setAddNote(e.target.value)} className={inputCls} />
                <button onClick={addOrUpdate} disabled={saving || !addMonth || !addPrice}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm font-medium">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            <div className="mt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">All Points</h4>
              {points.length === 0 ? (
                <p className="text-gray-400 text-sm py-4">No points yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      <th className="pb-1 pr-3 font-medium">Month</th>
                      <th className="pb-1 pr-3 font-medium text-right">Market</th>
                      <th className="pb-1 pr-3 font-medium text-right">Qty on Hand</th>
                      <th className="pb-1 pr-3 font-medium text-right">XIRR</th>
                      <th className="pb-1 pr-3 font-medium">Source</th>
                      <th className="pb-1"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {points.map(p => (
                      <tr key={p.snapshot_date} className="hover:bg-gray-50">
                        <td className="py-1.5 pr-3 text-gray-700">{p.snapshot_date.slice(0, 7)}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-800">{formatCents(p.market_price_cents)}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-600">{p.quantity_on_hand}</td>
                        <td className={`py-1.5 pr-3 text-right font-medium ${p.xirr == null ? 'text-gray-300' : p.xirr >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                          {p.xirr != null ? (p.xirr >= 0 ? '+' : '') + (p.xirr * 100).toFixed(1) + '%' : '—'}
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-gray-500">{p.source.replace('_', ' ')}</td>
                        <td className="py-1.5 text-right">
                          <button onClick={() => remove(p.snapshot_date)} className="text-xs text-red-400 hover:text-red-600">Del</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Inventory Table ───────────────────────────────────────────────────────────

// Generic click-to-sort table header cell.
function SortHeader({
  label, k, sortKey, sortDir, onSort, className = "",
}: {
  label: string; k: string; sortKey: string; sortDir: 'asc' | 'desc';
  onSort: (k: string) => void; className?: string;
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onSort(k)}
      className={`pb-2 pr-3 font-medium cursor-pointer select-none hover:text-gray-800 ${active ? 'text-gray-900' : ''} ${className}`}
    >
      {label}
      {active && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

function InventoryTable({ items, onRefresh, platforms }: { items: InventoryItem[]; onRefresh: () => void; platforms: string[] }) {
  const [selling, setSelling] = useState<InventoryItem | null>(null);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [history, setHistory] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortKey, setSortKey] = useState('cost');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(k: string) {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  }

  function sortVal(i: InventoryItem, k: string): number | string | null {
    switch (k) {
      case 'name':      return i.name.toLowerCase();
      case 'qty':       return i.quantity_on_hand;
      case 'cost':      return i.unit_cost_basis_cents * i.quantity_on_hand;
      case 'market':    return i.market_price_cents != null ? i.market_price_cents * i.quantity_on_hand : null;
      case 'liq':       return i.liquidation_cents != null ? i.liquidation_cents * i.quantity_on_hand : null;
      case 'mkt_pct':   return i.market_price_cents != null && i.unit_cost_basis_cents > 0
                              ? (i.market_price_cents - i.unit_cost_basis_cents) / i.unit_cost_basis_cents : null;
      case 'liq_pct':   return i.liquidation_cents != null && i.unit_cost_basis_cents > 0
                              ? (i.liquidation_cents - i.unit_cost_basis_cents) / i.unit_cost_basis_cents : null;
      case 'xirr':      return i.xirr ?? null;
      case 'platform': {
        const list = i.platforms && i.platforms.length > 0 ? i.platforms : (i.purchase_platform ? [i.purchase_platform] : []);
        return list[0]?.toLowerCase() ?? null;
      }
      default: return null;
    }
  }

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

  const q = search.trim().toLowerCase();
  const filtered = items.filter(i => {
    if (typeFilter && i.item_type !== typeFilter) return false;
    if (q) {
      const hay = `${i.name} ${i.set_name ?? ''} ${i.sku_note ?? ''} ${i.notes ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const av = sortVal(a, sortKey), bv = sortVal(b, sortKey);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;   // nulls always last
    if (bv == null) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  return (
    <>
      {selling && (
        <RecordSaleModal purchase={selling} onClose={() => setSelling(null)} onSaved={onRefresh} platforms={platforms} />
      )}
      {editing && (
        <EditPurchaseModal purchase={editing} platforms={platforms} onClose={() => setEditing(null)} onSaved={onRefresh} />
      )}
      {history && history.tcgplayer_product_id != null && (
        <SKUHistoryModal
          productId={history.tcgplayer_product_id}
          itemName={history.name}
          onClose={() => setHistory(null)}
        />
      )}
      <div className="flex items-center gap-3 mb-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name / set / notes…"
          className="flex-1 max-w-xs border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All types</option>
          {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <span className="text-xs text-gray-500 ml-auto">
          {sorted.length} of {items.length} {items.length === 1 ? 'row' : 'rows'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
              <SortHeader label="Item"       k="name"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Qty"        k="qty"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
              <SortHeader label="Cost Basis" k="cost"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
              <SortHeader label="Market"     k="market"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
              <SortHeader label="Liquidation" k="liq"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
              <SortHeader label="% (Market)" k="mkt_pct"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
              <SortHeader label="% (Liq)"    k="liq_pct"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
              <SortHeader label="XIRR"       k="xirr"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
              <SortHeader label="Platform"   k="platform" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="pb-2 pr-3 font-medium">SKU Note</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map(item => {
              const mktPct = item.market_price_cents != null && item.unit_cost_basis_cents > 0
                ? (item.market_price_cents - item.unit_cost_basis_cents) / item.unit_cost_basis_cents * 100
                : null;
              const liqPct = item.liquidation_cents != null && item.unit_cost_basis_cents > 0
                ? (item.liquidation_cents - item.unit_cost_basis_cents) / item.unit_cost_basis_cents * 100
                : null;
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
                          {item.lot_count && item.lot_count > 1 && (
                            <span className="ml-1.5 inline-block px-1.5 py-0 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">
                              {item.lot_count} lots
                            </span>
                          )}
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
                  <td className={`py-3 pr-3 text-right font-semibold text-sm ${mktPct == null ? 'text-gray-300' : mktPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {mktPct != null ? (mktPct >= 0 ? '+' : '') + mktPct.toFixed(1) + '%' : '—'}
                  </td>
                  <td className={`py-3 pr-3 text-right font-semibold text-sm ${liqPct == null ? 'text-gray-300' : liqPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {liqPct != null ? (liqPct >= 0 ? '+' : '') + liqPct.toFixed(1) + '%' : '—'}
                  </td>
                  <td className={`py-3 pr-3 text-right text-sm font-medium ${item.xirr == null ? 'text-gray-300' : item.xirr >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                    {item.xirr != null ? (item.xirr >= 0 ? '+' : '') + (item.xirr * 100).toFixed(1) + '%' : '—'}
                  </td>
                  <td className="py-3 pr-3">
                    {(() => {
                      const list = item.platforms && item.platforms.length > 0
                        ? item.platforms
                        : (item.purchase_platform ? [item.purchase_platform] : []);
                      if (list.length === 0) return <span className="text-xs text-gray-300">—</span>;
                      return (
                        <span className="text-xs text-gray-600" title={list.join(', ')}>
                          {list.slice(0, 2).join(', ')}
                          {list.length > 2 && ` +${list.length - 2}`}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-3 pr-3">
                    <SKUNoteCell item={item} onUpdated={onRefresh} />
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2 items-center flex-wrap">
                    {item.tcgplayer_product_id != null && (
                      <button
                        onClick={() => setHistory(item)}
                        className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-2 py-0.5 rounded"
                        title="Market + XIRR history chart"
                      >
                        Chart
                      </button>
                    )}
                    {item.lot_count && item.lot_count > 1 ? (
                      <span className="text-xs text-gray-400 italic" title="Switch to By Lot to edit/sell specific acquisitions">
                        rolled up
                      </span>
                    ) : (
                    <>
                      <button
                        onClick={() => setEditing(item)}
                        className="text-xs text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-2 py-0.5 rounded"
                      >
                        Edit
                      </button>
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
                    </>
                    )}
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

function PurchasesTable({ items, onRefresh, platforms }: { items: Purchase[]; onRefresh: () => void; platforms: string[] }) {
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function toggleSort(k: string) {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  }

  function sortVal(p: Purchase, k: string): number | string | null {
    switch (k) {
      case 'name':     return p.name.toLowerCase();
      case 'qty':      return p.quantity;
      case 'unitcost': return p.unit_cost_basis_cents;
      case 'total':    return p.unit_cost_basis_cents * p.quantity;
      case 'date':     return p.purchased_at;
      case 'platform': return (p.purchase_platform ?? '').toLowerCase();
      default: return null;
    }
  }

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

  const q = search.trim().toLowerCase();
  const filtered = items.filter(p => {
    if (typeFilter && p.item_type !== typeFilter) return false;
    if (q) {
      const hay = `${p.name} ${p.set_name ?? ''} ${p.purchase_platform ?? ''} ${p.notes ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const av = sortVal(a, sortKey), bv = sortVal(b, sortKey);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  return (
    <>
      {editing && (
        <EditPurchaseModal purchase={editing} platforms={platforms} onClose={() => setEditing(null)} onSaved={onRefresh} />
      )}
      <div className="flex items-center gap-3 mb-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name / set / platform / notes…"
          className="flex-1 max-w-xs border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All types</option>
          {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <span className="text-xs text-gray-500 ml-auto">
          {sorted.length} of {items.length} {items.length === 1 ? 'row' : 'rows'}
        </span>
      </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
            <SortHeader label="Item"       k="name"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Qty"        k="qty"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
            <SortHeader label="Cost / unit" k="unitcost" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
            <SortHeader label="Total Paid" k="total"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right" />
            <SortHeader label="Date"       k="date"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <SortHeader label="Platform"   k="platform" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <th className="pb-2 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map(item => (
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
              <td className="py-3 pr-3">
                <PlatformCell item={item} platforms={platforms} onUpdated={onRefresh} />
              </td>
              <td className="py-3">
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setEditing(item)}
                    className="text-xs text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-2 py-0.5 rounded"
                  >
                    Edit
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
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

// ── Analytics Table ───────────────────────────────────────────────────────────

function AnalyticsTable({ groups }: { groups: AnalyticsGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-gray-400 text-sm py-8 text-center">No data for this filter.</p>;
  }

  const totals = groups.reduce(
    (acc, g) => ({
      count: acc.count + g.count,
      cost: acc.cost + g.cost_basis_cents,
      market: acc.market + g.market_value_cents,
      liq: acc.liq + g.liquidation_cents,
    }),
    { count: 0, cost: 0, market: 0, liq: 0 },
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
            <th className="pb-2 pr-3 font-medium">Group</th>
            <th className="pb-2 pr-3 font-medium text-right">Positions</th>
            <th className="pb-2 pr-3 font-medium text-right">Cost Basis</th>
            <th className="pb-2 pr-3 font-medium text-right">Market</th>
            <th className="pb-2 pr-3 font-medium text-right">Liquidation</th>
            <th className="pb-2 pr-3 font-medium text-right">% (Market)</th>
            <th className="pb-2 pr-3 font-medium text-right">% (Liq)</th>
            <th className="pb-2 pr-3 font-medium text-right">XIRR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {groups.map(g => (
            <tr key={g.key} className="hover:bg-gray-50">
              <td className="py-3 pr-3 font-medium text-gray-900">{g.key.replace(/_/g, ' ')}</td>
              <td className="py-3 pr-3 text-right text-gray-700">{g.count}</td>
              <td className="py-3 pr-3 text-right text-gray-700">{formatCents(g.cost_basis_cents)}</td>
              <td className="py-3 pr-3 text-right text-gray-800">{formatCents(g.market_value_cents)}</td>
              <td className="py-3 pr-3 text-right font-medium text-amber-600">{formatCents(g.liquidation_cents)}</td>
              <td className={`py-3 pr-3 text-right font-semibold ${g.gain_market_pct == null ? 'text-gray-300' : g.gain_market_pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {g.gain_market_pct != null ? (g.gain_market_pct >= 0 ? '+' : '') + g.gain_market_pct.toFixed(1) + '%' : '—'}
              </td>
              <td className={`py-3 pr-3 text-right font-semibold ${g.gain_liq_pct == null ? 'text-gray-300' : g.gain_liq_pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {g.gain_liq_pct != null ? (g.gain_liq_pct >= 0 ? '+' : '') + g.gain_liq_pct.toFixed(1) + '%' : '—'}
              </td>
              <td className={`py-3 pr-3 text-right font-semibold ${g.xirr == null ? 'text-gray-300' : g.xirr >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                {g.xirr != null ? (g.xirr >= 0 ? '+' : '') + (g.xirr * 100).toFixed(1) + '%' : '—'}
              </td>
            </tr>
          ))}
          <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
            <td className="py-3 pr-3 text-gray-900">Total</td>
            <td className="py-3 pr-3 text-right text-gray-800">{totals.count}</td>
            <td className="py-3 pr-3 text-right text-gray-900">{formatCents(totals.cost)}</td>
            <td className="py-3 pr-3 text-right text-gray-900">{formatCents(totals.market)}</td>
            <td className="py-3 pr-3 text-right text-amber-700">{formatCents(totals.liq)}</td>
            <td colSpan={3} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ManifestPage() {
  const [tab, setTab] = useState<Tab>('inventory');
  const [game, setGame] = useState('');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [platforms, setPlatforms] = useState<string[]>(DEFAULT_PLATFORMS);
  const [summary, setSummary] = useState<ManifestSummary | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsGroup[]>([]);
  const [groupBy, setGroupBy] = useState<AnalyticsGroupBy>('item_type');
  const [inventoryGroup, setInventoryGroup] = useState<InventoryGroup>('sku');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'inventory') {
        setInventory(await listInventory(game, inventoryGroup));
      } else if (tab === 'purchases') {
        setPurchases(await listPurchases(game));
      } else {
        const resp = await getManifestAnalytics(groupBy, game || undefined);
        setAnalytics(resp.groups);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab, game, groupBy, inventoryGroup]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    listPlatforms().then(p => {
      if (p.length > 0) setPlatforms(p);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    getManifestSummary(game || undefined).then(setSummary).catch(() => setSummary(null));
  }, [game]);

  const totalCost = inventory.reduce((s, i) => s + i.unit_cost_basis_cents * i.quantity_on_hand, 0);
  const totalMarket = inventory.reduce((s, i) => s + (i.market_price_cents ?? 0) * i.quantity_on_hand, 0);
  const totalLiquidation = inventory.reduce((s, i) => s + (i.liquidation_cents ?? 0) * i.quantity_on_hand, 0);
  const hasMarket = inventory.some(i => i.market_price_cents != null);
  const mktPct = hasMarket && totalCost > 0 ? (totalMarket - totalCost) / totalCost * 100 : null;
  const liqPct = hasMarket && totalCost > 0 ? (totalLiquidation - totalCost) / totalCost * 100 : null;

  function fmtPct(v: number | null) {
    if (v == null) return null;
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  }

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
          <option value="">All games</option>
          {GAMES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
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
            {mktPct != null && (
              <div className={`text-xs font-medium mt-0.5 ${mktPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {fmtPct(mktPct)}
              </div>
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">Liquidation <span className="text-gray-400">(85%)</span></div>
            <div className={`text-lg font-bold ${hasMarket ? 'text-amber-600' : 'text-gray-300'}`}>
              {hasMarket ? formatCents(totalLiquidation) : '—'}
            </div>
            {liqPct != null && (
              <div className={`text-xs font-medium mt-0.5 ${liqPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {fmtPct(liqPct)}
              </div>
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">Portfolio XIRR</div>
            {summary?.portfolio_xirr != null ? (
              <div className={`text-lg font-bold ${summary.portfolio_xirr >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                {(summary.portfolio_xirr >= 0 ? '+' : '') + (summary.portfolio_xirr * 100).toFixed(1) + '%'}
              </div>
            ) : (
              <div className="text-lg font-bold text-gray-300">—</div>
            )}
          </div>
        </div>
      )}

      {/* Add purchase */}
      <AddPurchaseForm onAdded={load} platforms={platforms} />

      {/* Tabs */}
      <div className="flex items-center justify-between mb-4 mt-4 border-b border-gray-200">
        <div className="flex gap-1">
          {(['inventory', 'purchases', 'analytics'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'inventory' ? 'Inventory' : t === 'purchases' ? 'All Purchases' : 'Analytics'}
            </button>
          ))}
        </div>
        {tab === 'inventory' && (
          <div className="flex items-center gap-2 pb-2">
            <label className="text-xs text-gray-500">Group</label>
            <select
              value={inventoryGroup}
              onChange={e => setInventoryGroup(e.target.value as InventoryGroup)}
              className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="sku">By SKU (rolled up)</option>
              <option value="lot">By Lot (per purchase)</option>
            </select>
          </div>
        )}
        {tab === 'analytics' && (
          <div className="flex items-center gap-2 pb-2">
            <label className="text-xs text-gray-500">Group by</label>
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as AnalyticsGroupBy)}
              className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {GROUP_BY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Content */}
      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : tab === 'inventory' ? (
        <InventoryTable items={inventory} onRefresh={load} platforms={platforms} />
      ) : tab === 'purchases' ? (
        <PurchasesTable items={purchases} onRefresh={load} platforms={platforms} />
      ) : (
        <AnalyticsTable groups={analytics} />
      )}
    </div>
  );
}

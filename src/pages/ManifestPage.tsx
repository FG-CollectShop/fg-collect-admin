import { useState, useEffect, useCallback } from 'react';
import {
  listInventory, listPurchases, listPlatforms, getManifestSummary, getManifestAnalytics,
  createPurchase, updatePurchase, deletePurchase, recordSale, refreshPrice, putSKUNote,
  putSKULocation, listSales,
  lookupTCGProduct, getSKUHistory, putSKUHistoryPoint, deleteSKUHistoryPoint,
  InventoryItem, Purchase, ManifestSummary, AnalyticsGroup, AnalyticsGroupBy, InventoryGroup,
  SKUHistoryPoint, ItemType, Platform, SaleRecord, formatCents,
} from '../api/manifest';

type Tab = 'inventory' | 'purchases' | 'sales' | 'analytics';

// Columns available to hide in print, per tab. Keys match the `col-<key>`
// className on the corresponding <th> and <td> elements.
const PRINT_COLUMNS: Record<Exclude<Tab, 'analytics'>, { key: string; label: string; defaultHidden?: boolean }[]> = {
  inventory: [
    { key: 'image',     label: 'Product image', defaultHidden: true },
    { key: 'qty',       label: 'Qty' },
    { key: 'cost',      label: 'Cost basis' },
    { key: 'market',    label: 'Market' },
    { key: 'liq',       label: 'Liquidation' },
    { key: 'mkt_pct',   label: '% (Market)',   defaultHidden: true },
    { key: 'liq_pct',   label: '% (Liq)',      defaultHidden: true },
    { key: 'xirr',      label: 'XIRR (Mkt)' },
    { key: 'xirr_liq',  label: 'XIRR (Liq)',   defaultHidden: true },
    { key: 'platform',  label: 'Platform' },
    { key: 'location',  label: 'Location' },
    { key: 'sku_note',  label: 'SKU Note',     defaultHidden: true },
  ],
  purchases: [
    { key: 'image',    label: 'Product image', defaultHidden: true },
    { key: 'qty',      label: 'Qty' },
    { key: 'unitcost', label: 'Cost / unit' },
    { key: 'total',    label: 'Total Paid' },
    { key: 'date',     label: 'Date' },
    { key: 'platform', label: 'Platform' },
  ],
  sales: [
    { key: 'game',      label: 'Game' },
    { key: 'type',      label: 'Type' },
    { key: 'qty',       label: 'Qty' },
    { key: 'unit_sale', label: 'Unit $' },
    { key: 'total',     label: 'Total' },
    { key: 'cogs',      label: 'COGS' },
    { key: 'profit',    label: 'Gross P' },
    { key: 'platform',  label: 'Platform' },
    { key: 'purchased', label: 'Purchased date', defaultHidden: true },
    { key: 'notes',     label: 'Notes',          defaultHidden: true },
  ],
};

function loadHiddenCols(tab: Tab): Set<string> {
  if (tab === 'analytics') return new Set();
  const raw = localStorage.getItem(`manifest.print.hidden.${tab}`);
  if (raw) {
    try { return new Set(JSON.parse(raw) as string[]); } catch { /* fall through */ }
  }
  // First-run defaults.
  return new Set(PRINT_COLUMNS[tab].filter(c => c.defaultHidden).map(c => c.key));
}

function saveHiddenCols(tab: Tab, hidden: Set<string>) {
  if (tab === 'analytics') return;
  localStorage.setItem(`manifest.print.hidden.${tab}`, JSON.stringify(Array.from(hidden)));
}

const GROUP_BY_OPTIONS: { value: AnalyticsGroupBy; label: string }[] = [
  { value: 'item_type',         label: 'Item Type' },
  { value: 'game',              label: 'Game' },
  { value: 'set',               label: 'Set' },
  { value: 'purchase_platform', label: 'Platform' },
];

const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: 'booster_box',           label: 'Booster Box' },
  { value: 'booster_bundle',        label: 'Booster Bundle' },
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

const DEFAULT_PLATFORMS = [
  'tcgplayer', 'ebay', 'amazon', 'facebook', 'reddit',
  'AnonTCG', 'Alpha Investments', 'Rogue Deckbuilder',
  'lgs', 'local', 'other',
];

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
  'hololive':                    'hololive',
  'hololive official card game': 'hololive',
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
  { value: 'hololive',  label: 'hololive' },
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

// ── Add Purchase Form (multi-line cart) ───────────────────────────────────────
//
// Real-world usage: one store trip → several SKUs bought together, all sharing
// the same date + platform. Rather than opening the form N times, this form
// keeps the shared metadata at the top and lets you add as many line items as
// you want before hitting Save. Each line submits as a separate purchase row
// (kept per-lot for accurate cost basis / XIRR); atomicity isn't required.

interface LineItem {
  key: string;
  tcgplayer_product_id: string;
  name: string;
  item_type: ItemType;
  quantity: string;
  unit_cost_basis_cents: string;
  market_price_cents: string;
  looking_up: boolean;
  lookup_err: string | null;
  save_status: 'pending' | 'saving' | 'saved' | 'error';
  save_err: string | null;
}

const emptyLine = (): LineItem => ({
  key: Math.random().toString(36).slice(2),
  tcgplayer_product_id: '',
  name: '',
  item_type: 'booster_box',
  quantity: '1',
  unit_cost_basis_cents: '',
  market_price_cents: '',
  looking_up: false,
  lookup_err: null,
  save_status: 'pending',
  save_err: null,
});

function AddPurchaseForm({ onAdded, platforms }: { onAdded: () => void; platforms: string[] }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shared, setShared] = useState({
    game: '',
    purchased_at: today(),
    purchase_platform: '',
    notes: '',
  });
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

  const setSharedField = (k: keyof typeof shared) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setShared(s => ({ ...s, [k]: e.target.value }));

  function updateLine(key: string, patch: Partial<LineItem>) {
    setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines(ls => [...ls, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines(ls => (ls.length === 1 ? ls : ls.filter(l => l.key !== key)));
  }

  async function lookupLine(key: string) {
    const line = lines.find(l => l.key === key);
    if (!line) return;
    const raw = line.tcgplayer_product_id.trim();
    if (!raw) return;
    const pid = parseInt(raw, 10);
    if (isNaN(pid) || pid <= 0) return;
    updateLine(key, { looking_up: true, lookup_err: null });
    try {
      const data = await lookupTCGProduct(pid);
      // Only fill fields the user hasn't touched.
      const patch: Partial<LineItem> = { looking_up: false };
      if (!line.name.trim()) patch.name = data.name;
      if (!line.market_price_cents.trim() && data.market_price_cents) {
        patch.market_price_cents = (data.market_price_cents / 100).toFixed(2);
      }
      updateLine(key, patch);
      // Also auto-set the shared game if it's still empty and the SKU tells us.
      const nextGame = gameFromProductLine(data.product_line);
      if (nextGame && !shared.game) {
        setShared(s => ({ ...s, game: nextGame }));
      }
    } catch (e) {
      updateLine(key, { looking_up: false, lookup_err: e instanceof Error ? e.message : 'lookup failed' });
      setTimeout(() => updateLine(key, { lookup_err: null }), 5000);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const validLines = lines.filter(l => l.name.trim() && l.unit_cost_basis_cents.trim());
    if (validLines.length === 0) return;
    if (!shared.game) {
      alert('Please pick a game before saving.');
      return;
    }
    setSaving(true);
    let allOk = true;
    for (const line of lines) {
      if (!line.name.trim() || !line.unit_cost_basis_cents.trim()) {
        // Skip empty / partial lines silently — treat them as blank rows.
        continue;
      }
      updateLine(line.key, { save_status: 'saving', save_err: null });
      try {
        await createPurchase({
          game: shared.game,
          name: line.name,
          item_type: line.item_type,
          tcgplayer_product_id: line.tcgplayer_product_id ? parseInt(line.tcgplayer_product_id) : undefined,
          quantity: parseInt(line.quantity) || 1,
          unit_cost_basis_cents: cents(line.unit_cost_basis_cents),
          market_price_cents: line.market_price_cents ? cents(line.market_price_cents) : undefined,
          purchased_at: shared.purchased_at,
          purchase_platform: shared.purchase_platform || undefined,
          notes: shared.notes || undefined,
        });
        updateLine(line.key, { save_status: 'saved' });
      } catch (err) {
        allOk = false;
        updateLine(line.key, { save_status: 'error', save_err: err instanceof Error ? err.message : 'save failed' });
      }
    }
    setSaving(false);
    onAdded();
    if (allOk) {
      // Reset form for the next store visit.
      setLines([emptyLine()]);
      setShared(s => ({ ...s, notes: '' }));
      setOpen(false);
    }
    // If some failed, keep the form open so the user can see which lines errored.
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
  const cellInput = "w-full border border-gray-300 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500";

  const totalCost = lines.reduce((s, l) => {
    const q = parseInt(l.quantity) || 0;
    const c = parseFloat(l.unit_cost_basis_cents) || 0;
    return s + q * c;
  }, 0);

  return (
    <form onSubmit={submit} className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">New Purchase — {lines.length} {lines.length === 1 ? 'item' : 'items'}</h3>
        <div className="text-xs text-gray-500">Total: <span className="font-semibold text-gray-800">${totalCost.toFixed(2)}</span></div>
      </div>

      {/* Shared meta */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div>
          <label className={labelCls}>Game *</label>
          <select value={shared.game} onChange={setSharedField('game')} className={inputCls} required>
            <option value="">— pick a game —</option>
            {GAMES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Date</label>
          <input type="date" value={shared.purchased_at} onChange={setSharedField('purchased_at')} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Platform (store)</label>
          <input
            list="platform-suggestions"
            value={shared.purchase_platform}
            onChange={setSharedField('purchase_platform')}
            placeholder="e.g. tcgplayer"
            className={inputCls}
          />
          <datalist id="platform-suggestions">
            {platforms.map(p => <option key={p} value={p} />)}
          </datalist>
        </div>
        <div>
          <label className={labelCls}>Order / receipt note</label>
          <input value={shared.notes} onChange={setSharedField('notes')} placeholder="applies to every line" className={inputCls} />
        </div>
      </div>

      {/* Line items */}
      <div className="border border-gray-200 rounded overflow-x-auto bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-1.5 font-medium w-24">TCG ID</th>
              <th className="px-2 py-1.5 font-medium">Name *</th>
              <th className="px-2 py-1.5 font-medium w-40">Type</th>
              <th className="px-2 py-1.5 font-medium w-16 text-right">Qty *</th>
              <th className="px-2 py-1.5 font-medium w-24 text-right">Cost / unit *</th>
              <th className="px-2 py-1.5 font-medium w-24 text-right">Market</th>
              <th className="px-2 py-1.5 font-medium w-20 text-center">Status</th>
              <th className="px-2 py-1.5 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map(line => (
              <tr key={line.key} className={line.save_status === 'error' ? 'bg-red-50' : line.save_status === 'saved' ? 'bg-green-50' : ''}>
                <td className="px-2 py-1.5 align-top">
                  <input
                    type="number"
                    value={line.tcgplayer_product_id}
                    onChange={e => updateLine(line.key, { tcgplayer_product_id: e.target.value })}
                    onBlur={() => lookupLine(line.key)}
                    placeholder="618907"
                    className={cellInput}
                  />
                  {line.looking_up && <div className="text-[10px] text-blue-500 mt-0.5">looking up…</div>}
                  {line.lookup_err && <div className="text-[10px] text-red-500 mt-0.5">{line.lookup_err}</div>}
                </td>
                <td className="px-2 py-1.5 align-top">
                  <input
                    value={line.name}
                    onChange={e => updateLine(line.key, { name: e.target.value })}
                    placeholder="auto-fills from TCG ID"
                    className={cellInput}
                  />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <select
                    value={line.item_type}
                    onChange={e => updateLine(line.key, { item_type: e.target.value as ItemType })}
                    className={cellInput}
                  >
                    {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5 align-top">
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={e => updateLine(line.key, { quantity: e.target.value })}
                    className={cellInput + ' text-right'}
                  />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.unit_cost_basis_cents}
                    onChange={e => updateLine(line.key, { unit_cost_basis_cents: e.target.value })}
                    placeholder="0.00"
                    className={cellInput + ' text-right'}
                  />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.market_price_cents}
                    onChange={e => updateLine(line.key, { market_price_cents: e.target.value })}
                    placeholder="auto"
                    className={cellInput + ' text-right'}
                  />
                </td>
                <td className="px-2 py-1.5 align-top text-center text-[10px]">
                  {line.save_status === 'pending' && <span className="text-gray-300">—</span>}
                  {line.save_status === 'saving' && <span className="text-blue-500">saving…</span>}
                  {line.save_status === 'saved' && <span className="text-green-600 font-semibold">✓ saved</span>}
                  {line.save_status === 'error' && <span className="text-red-500" title={line.save_err ?? ''}>✗ error</span>}
                </td>
                <td className="px-2 py-1.5 align-top text-center">
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length === 1}
                    className="text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-300"
                    title="Remove this line"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button type="button" onClick={addLine} className="text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-3 py-1 rounded">
          + Add line
        </button>
        <div className="ml-auto flex gap-2">
          <button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm font-medium">
            {saving ? 'Saving…' : `Save ${lines.filter(l => l.name && l.unit_cost_basis_cents).length} items`}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-700 px-4 py-1.5 text-sm">
            Cancel
          </button>
        </div>
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

  function cancel() {
    setVal(item.sku_note ?? '');
    setEditing(false);
  }

  // Only save when the value actually changed — avoids a wasted API call on
  // "click into cell → click out". The ✕ button uses onMouseDown+preventDefault
  // to swallow the blur so cancel wins over save.
  async function saveIfDirty() {
    if (val === (item.sku_note ?? '')) {
      setEditing(false);
      return;
    }
    await save();
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <textarea
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={saveIfDirty}
          onKeyDown={e => {
            if (e.key === 'Escape') { cancel(); }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { save(); }
          }}
          rows={2}
          className="w-full border border-blue-400 rounded px-1 py-0.5 text-xs text-gray-900"
          placeholder="SKU note (Ctrl+Enter save · Esc cancel · click out saves)"
        />
        <div className="flex gap-1">
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={save}
            disabled={saving}
            className="text-green-600 hover:text-green-700 text-xs font-bold"
          >
            {saving ? '…' : '✓'}
          </button>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={cancel}
            className="text-gray-400 hover:text-gray-600 text-xs"
          >
            ✕
          </button>
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

// ── SKU Storage Location cell (shared across purchases of same product_id) ──

function SKULocationCell({ item, onUpdated }: { item: InventoryItem; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.sku_location ?? '');
  const [saving, setSaving] = useState(false);

  if (item.tcgplayer_product_id == null) {
    return <span className="text-xs text-gray-300">—</span>;
  }

  async function save() {
    setSaving(true);
    try {
      await putSKULocation(item.tcgplayer_product_id!, val);
      setEditing(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setVal(item.sku_location ?? '');
    setEditing(false);
  }

  async function saveIfDirty() {
    if (val === (item.sku_location ?? '')) {
      setEditing(false);
      return;
    }
    await save();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="text"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={saveIfDirty}
          onKeyDown={e => {
            if (e.key === 'Escape') { cancel(); }
            if (e.key === 'Enter') { save(); }
          }}
          className="w-32 border border-blue-400 rounded px-1 py-0.5 text-xs text-gray-900"
          placeholder="e.g. binder A"
        />
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={cancel}
          className="text-gray-400 hover:text-gray-600 text-xs"
        >
          ✕
        </button>
        {saving && <span className="text-xs text-gray-400">…</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-left hover:text-blue-600 transition-colors text-gray-600 max-w-[140px] whitespace-normal"
    >
      {item.sku_location || <span className="text-gray-300">+ set location</span>}
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

  // XIRR axis spans both market and liq series so scales align.
  const xirrValsAll: number[] = [];
  withData.forEach(p => {
    if (p.xirr != null) xirrValsAll.push(p.xirr * 100);
    if (p.xirr_liq != null) xirrValsAll.push(p.xirr_liq * 100);
  });
  const hasXIRR = xirrValsAll.length > 0;
  const xMin = hasXIRR ? Math.min(...xirrValsAll, 0) : 0;
  const xMax = hasXIRR ? Math.max(...xirrValsAll, 0) : 100;
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

  const xirrLiqPoints = withData.filter(p => p.xirr_liq != null);
  const xirrLiqPath = xirrLiqPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${px(new Date(p.snapshot_date).getTime())},${pyX((p.xirr_liq as number) * 100)}`)
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
      {/* XIRR (market) line */}
      {xirrPoints.length > 0 && (
        <>
          <path d={xirrPath} stroke="#2563eb" strokeWidth="2" fill="none" strokeDasharray="4,2" />
          {xirrPoints.map((p, i) => (
            <circle key={`xp${i}`} cx={px(new Date(p.snapshot_date).getTime())} cy={pyX((p.xirr as number) * 100)}
                    r="2.5" fill="#2563eb">
              <title>{p.snapshot_date}: XIRR (Mkt) {((p.xirr as number) * 100).toFixed(1)}%</title>
            </circle>
          ))}
        </>
      )}
      {/* XIRR (liquidation) line — lighter, thinner */}
      {xirrLiqPoints.length > 0 && (
        <>
          <path d={xirrLiqPath} stroke="#93c5fd" strokeWidth="1.5" fill="none" strokeDasharray="2,3" />
          {xirrLiqPoints.map((p, i) => (
            <circle key={`xlp${i}`} cx={px(new Date(p.snapshot_date).getTime())} cy={pyX((p.xirr_liq as number) * 100)}
                    r="2" fill="#93c5fd">
              <title>{p.snapshot_date}: XIRR (Liq) {((p.xirr_liq as number) * 100).toFixed(1)}%</title>
            </circle>
          ))}
        </>
      )}
      {/* Legend */}
      <g transform={`translate(${padL},${padT})`}>
        <rect x="0" y="0" width="10" height="10" fill="#d97706" />
        <text x="14" y="9" fontSize="10" fill="#374151">Market $</text>
        {xirrPoints.length > 0 && (
          <>
            <line x1="80" y1="5" x2="94" y2="5" stroke="#2563eb" strokeWidth="2" strokeDasharray="4,2" />
            <text x="98" y="9" fontSize="10" fill="#374151">XIRR (Mkt) %</text>
          </>
        )}
        {xirrLiqPoints.length > 0 && (
          <>
            <line x1="170" y1="5" x2="184" y2="5" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="2,3" />
            <text x="188" y="9" fontSize="10" fill="#374151">XIRR (Liq) %</text>
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
                      <th className="pb-1 pr-3 font-medium text-right">XIRR (Mkt)</th>
                      <th className="pb-1 pr-3 font-medium text-right">XIRR (Liq)</th>
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
                        <td className={`py-1.5 pr-3 text-right font-medium ${p.xirr_liq == null ? 'text-gray-300' : p.xirr_liq >= 0 ? 'text-blue-600 opacity-80' : 'text-red-500 opacity-80'}`}>
                          {p.xirr_liq != null ? (p.xirr_liq >= 0 ? '+' : '') + (p.xirr_liq * 100).toFixed(1) + '%' : '—'}
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

// Generic click-to-sort table header cell. `hint` shows on hover as a native
// browser tooltip and a dotted underline nudge lets users know it's there.
function SortHeader({
  label, k, sortKey, sortDir, onSort, hint, className = "",
}: {
  label: string; k: string; sortKey: string; sortDir: 'asc' | 'desc';
  onSort: (k: string) => void; hint?: string; className?: string;
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onSort(k)}
      title={hint}
      className={`pb-2 pr-3 font-medium cursor-pointer select-none hover:text-gray-800 ${active ? 'text-gray-900' : ''} ${className}`}
    >
      <span className={hint ? 'border-b border-dotted border-gray-400' : ''}>{label}</span>
      {active && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

function InventoryTable({
  items, onRefresh, platforms, onSwitchToLotView,
  search, setSearch,
}: {
  items: InventoryItem[];
  onRefresh: () => void;
  platforms: string[];
  onSwitchToLotView: (searchQuery?: string) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  const [selling, setSelling] = useState<InventoryItem | null>(null);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [history, setHistory] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
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
      case 'xirr_liq':  return i.xirr_liq ?? null;
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
              <SortHeader label="Item"        k="name"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}
                          hint="TCGPlayer product name (auto-filled). Set + type shown below; blue badge = rolled-up lot count." />
              <SortHeader label="Qty"         k="qty"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-qty"
                          hint="Units currently on hand across all lots (purchased minus sold)." />
              <SortHeader label="Cost Basis"  k="cost"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-cost"
                          hint="Total invested in this SKU for on-hand units. Per-unit shown below (weighted average across lots)." />
              <SortHeader label="Market"      k="market"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-market"
                          hint="Current total market value = per-unit market × qty on hand. Per-unit shown below." />
              <SortHeader label="Liquidation" k="liq"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-liq"
                          hint="Assumed sale value = market × 85% × qty. Approximates net proceeds after fees / competitive undercutting." />
              <SortHeader label="% (Market)"  k="mkt_pct"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-mkt_pct"
                          hint="Unrealized gain vs cost basis at market prices: (market − cost) / cost × 100." />
              <SortHeader label="% (Liq)"     k="liq_pct"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-liq_pct"
                          hint="Unrealized gain vs cost basis at liquidation value: (liq − cost) / cost × 100. What you'd actually net if you sold today." />
              <SortHeader label="XIRR (Mkt)"  k="xirr"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-xirr"
                          hint="Annualized return assuming you sell at TCGPlayer market. Terminal cash flow = market × qty on hand at today. N/A if held < 30 days or no market price." />
              <SortHeader label="XIRR (Liq)"  k="xirr_liq" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-xirr_liq"
                          hint="Annualized return you'd actually realize after the 85% liquidation haircut (fees, discounting). This is what hits your bank account." />
              <SortHeader label="Platform"    k="platform" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="col-platform"
                          hint="Distinct stores you bought this SKU from (aggregated across every lot). Read-only — edit per-lot from the Purchases tab or by switching Group to By Lot." />
              <th className="pb-2 pr-3 font-medium col-location" title="Physical storage location shared across every purchase of the same TCGPlayer product ID. Update it once — applies to every lot of that SKU.">
                <span className="border-b border-dotted border-gray-400">Location</span>
              </th>
              <th className="pb-2 pr-3 font-medium col-sku_note" title="Free-text note shared across every purchase of the same TCGPlayer product ID. Persists forever — good for reprint alerts, discontinued flags, keep-forever tags.">
                <span className="border-b border-dotted border-gray-400">SKU Note</span>
              </th>
              <th className="pb-2 font-medium no-print" title="Chart = market + XIRR history modal. Edit/Sell/Del = per-lot actions (only shown on single-lot rows; switch to By Lot to act on individual acquisitions).">
                <span className="border-b border-dotted border-gray-400">Actions</span>
              </th>
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
                      <span className="col-image shrink-0">
                        {item.image_url ? (
                          <a href={item.tcgplayer_url} target="_blank" rel="noopener noreferrer">
                            <img src={item.image_url} alt={item.name} className="w-12 h-12 object-contain rounded border border-gray-100" />
                          </a>
                        ) : (
                          <span className="w-12 h-12 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-gray-400 text-xs">?</span>
                        )}
                      </span>
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
                  <td className="py-3 pr-3 text-right text-gray-700 col-qty">
                    <div className="font-medium">{item.quantity_on_hand}</div>
                    {item.quantity_sold > 0 && <div className="text-xs text-gray-400">{item.quantity_sold} sold</div>}
                  </td>
                  <td className="py-3 pr-3 text-right text-gray-800 col-cost" title={`${formatCents(item.unit_cost_basis_cents)} per unit × ${item.quantity_on_hand}`}>
                    <div className="font-semibold">{formatCents(item.unit_cost_basis_cents * item.quantity_on_hand)}</div>
                    <div className="text-xs text-gray-400">{formatCents(item.unit_cost_basis_cents)}/u</div>
                  </td>
                  <td className="py-3 pr-3 text-right col-market">
                    <div className="font-semibold text-gray-800" title={item.market_price_cents != null ? `${formatCents(item.market_price_cents)} per unit × ${item.quantity_on_hand}` : ''}>
                      {item.market_price_cents != null
                        ? formatCents(item.market_price_cents * item.quantity_on_hand)
                        : <span className="text-gray-300 font-normal">—</span>}
                    </div>
                    <MarketPriceCell item={item} onUpdated={onRefresh} />
                  </td>
                  <td className="py-3 pr-3 text-right text-amber-600 col-liq" title={item.liquidation_cents != null ? `${formatCents(item.liquidation_cents)} per unit × ${item.quantity_on_hand}` : ''}>
                    {item.liquidation_cents != null ? (
                      <>
                        <div className="font-semibold">{formatCents(item.liquidation_cents * item.quantity_on_hand)}</div>
                        <div className="text-xs opacity-70">{formatCents(item.liquidation_cents)}/u</div>
                      </>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`py-3 pr-3 text-right font-semibold text-sm col-mkt_pct ${mktPct == null ? 'text-gray-300' : mktPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {mktPct != null ? (mktPct >= 0 ? '+' : '') + mktPct.toFixed(1) + '%' : '—'}
                  </td>
                  <td className={`py-3 pr-3 text-right font-semibold text-sm col-liq_pct ${liqPct == null ? 'text-gray-300' : liqPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {liqPct != null ? (liqPct >= 0 ? '+' : '') + liqPct.toFixed(1) + '%' : '—'}
                  </td>
                  <td className={`py-3 pr-3 text-right text-sm font-medium col-xirr ${item.xirr == null ? 'text-gray-300' : item.xirr >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                    {item.xirr != null ? (item.xirr >= 0 ? '+' : '') + (item.xirr * 100).toFixed(1) + '%' : '—'}
                  </td>
                  <td className={`py-3 pr-3 text-right text-sm font-medium col-xirr_liq ${item.xirr_liq == null ? 'text-gray-300' : item.xirr_liq >= 0 ? 'text-blue-600 opacity-80' : 'text-red-500 opacity-80'}`}>
                    {item.xirr_liq != null ? (item.xirr_liq >= 0 ? '+' : '') + (item.xirr_liq * 100).toFixed(1) + '%' : '—'}
                  </td>
                  <td className="py-3 pr-3 col-platform">
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
                  <td className="py-3 pr-3 col-location">
                    <SKULocationCell item={item} onUpdated={onRefresh} />
                  </td>
                  <td className="py-3 pr-3 col-sku_note">
                    <SKUNoteCell item={item} onUpdated={onRefresh} />
                  </td>
                  <td className="py-3 no-print">
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
                      <button
                        type="button"
                        onClick={() => onSwitchToLotView(item.name)}
                        title="Switch to By Lot view (filtered to this SKU) to edit/sell specific acquisitions"
                        className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 px-2 py-0.5 rounded"
                      >
                        {item.lot_count} lots · Sell ↗
                      </button>
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
            <SortHeader label="Item"        k="name"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}
                        hint="Product name and set as entered. Each row is one purchase (lot) — same SKU bought twice = two rows." />
            <SortHeader label="Qty"         k="qty"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-qty"
                        hint="Units in this specific acquisition. Doesn't reflect sales — see Inventory tab for on-hand qty." />
            <SortHeader label="Cost / unit" k="unitcost" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-unitcost"
                        hint="Per-unit price paid on this order (before shipping / fees unless you rolled them in)." />
            <SortHeader label="Total Paid"  k="total"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-total"
                        hint="qty × cost/unit for this lot. Sum across lots for total invested per SKU." />
            <SortHeader label="Date"        k="date"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="col-date"
                        hint="Purchase date you entered — this drives XIRR, not the timestamp of when you added it to the system." />
            <SortHeader label="Platform"    k="platform" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="col-platform"
                        hint="Where you bought this lot. Free-text; suggestions come from other platforms already in your data." />
            <th className="pb-2 font-medium no-print"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map(item => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="py-3 pr-3">
                <div className="flex items-center gap-3">
                  <span className="col-image shrink-0">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-10 h-10 object-contain rounded border border-gray-100" />
                    ) : (
                      <span className="w-10 h-10 bg-gray-100 rounded border border-gray-200 block" />
                    )}
                  </span>
                  <div>
                    <div className="font-medium text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.set_name ?? item.game} · {item.item_type.replace(/_/g, ' ')}</div>
                  </div>
                </div>
              </td>
              <td className="py-3 pr-3 text-right text-gray-700 col-qty">{item.quantity}</td>
              <td className="py-3 pr-3 text-right text-gray-600 col-unitcost">{formatCents(item.unit_cost_basis_cents)}</td>
              <td className="py-3 pr-3 text-right font-medium text-gray-800 col-total">{formatCents(item.unit_cost_basis_cents * item.quantity)}</td>
              <td className="py-3 pr-3 text-gray-600 col-date">{item.purchased_at}</td>
              <td className="py-3 pr-3 col-platform">
                <PlatformCell item={item} platforms={platforms} onUpdated={onRefresh} />
              </td>
              <td className="py-3 no-print">
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
            <th className="pb-2 pr-3 font-medium text-right" title="Annualized return at market">XIRR (Mkt)</th>
            <th className="pb-2 pr-3 font-medium text-right" title="Annualized return at 85% liquidation">XIRR (Liq)</th>
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
              <td className={`py-3 pr-3 text-right font-semibold ${g.xirr_liq == null ? 'text-gray-300' : g.xirr_liq >= 0 ? 'text-blue-600 opacity-80' : 'text-red-500 opacity-80'}`}>
                {g.xirr_liq != null ? (g.xirr_liq >= 0 ? '+' : '') + (g.xirr_liq * 100).toFixed(1) + '%' : '—'}
              </td>
            </tr>
          ))}
          <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
            <td className="py-3 pr-3 text-gray-900">Total</td>
            <td className="py-3 pr-3 text-right text-gray-800">{totals.count}</td>
            <td className="py-3 pr-3 text-right text-gray-900">{formatCents(totals.cost)}</td>
            <td className="py-3 pr-3 text-right text-gray-900">{formatCents(totals.market)}</td>
            <td className="py-3 pr-3 text-right text-amber-700">{formatCents(totals.liq)}</td>
            <td colSpan={4} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

// ── PrintControls: Print button + column-picker popover ─────────────────────
//
// The gear icon opens a popover that lists every column available on the
// current tab. Toggling a checkbox flips its class in the injected
// `<style>` block so print output hides / shows that column immediately.
// Selection is per-tab and persists in localStorage.

function PrintControls({ tab }: { tab: Tab }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => loadHiddenCols(tab));

  // Re-load defaults when the user switches tabs.
  useEffect(() => { setHidden(loadHiddenCols(tab)); }, [tab]);

  const columns = tab === 'analytics' ? [] : PRINT_COLUMNS[tab];

  function toggle(key: string) {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveHiddenCols(tab, next);
      return next;
    });
  }

  // Build an @media print stylesheet that hides tagged columns.
  const hideCss = Array.from(hidden)
    .map(k => `.manifest-root .col-${k} { display: none !important; }`)
    .join('\n');

  return (
    <>
      {hideCss && <style>{`@media print { ${hideCss} }`}</style>}
      <div className="relative inline-flex">
        <button
          type="button"
          onClick={() => window.print()}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-l hover:bg-gray-50"
          title="Print the current tab with the active filters"
        >
          🖨 Print
        </button>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="px-2 py-1.5 text-sm border-y border-r border-gray-300 rounded-r hover:bg-gray-50"
          title="Choose which columns to print"
          aria-expanded={open}
        >
          ⚙
        </button>
        {open && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded shadow-lg p-3 w-56 text-sm">
              <div className="font-medium text-gray-800 mb-2">Columns in print</div>
              {columns.length === 0 && (
                <div className="text-xs text-gray-500">Analytics tab prints as-is.</div>
              )}
              {columns.map(c => (
                <label key={c.key} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-1">
                  <input
                    type="checkbox"
                    checked={!hidden.has(c.key)}
                    onChange={() => toggle(c.key)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-xs text-gray-700">{c.label}</span>
                </label>
              ))}
              <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const empty = new Set<string>();
                    saveHiddenCols(tab, empty);
                    setHidden(empty);
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Show all
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── SalesTable: audit-ready sales manifest ────────────────────────────────────
//
// One row per purchase_sales entry. COGS uses the specific-lot cost basis
// (each sale row points to a specific purchase). Includes running totals in
// the footer for the quick sanity glance at the top of a tax filing.

function SalesTable({ items }: { items: SaleRecord[] }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortKey, setSortKey] = useState('sold_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const platforms = Array.from(new Set(items.map(i => i.sale_platform).filter(Boolean))) as string[];
  platforms.sort();

  const filtered = items.filter(s => {
    if (search) {
      const q = search.toLowerCase();
      const bag = [s.name, s.set_name, s.sale_notes, s.sale_platform, s.game]
        .filter(Boolean).join(' ').toLowerCase();
      if (!bag.includes(q)) return false;
    }
    if (typeFilter && s.item_type !== typeFilter) return false;
    if (platformFilter && s.sale_platform !== platformFilter) return false;
    if (fromDate && s.sold_at < fromDate) return false;
    if (toDate && s.sold_at > toDate) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'sold_at':   return a.sold_at.localeCompare(b.sold_at) * dir;
      case 'name':      return a.name.localeCompare(b.name) * dir;
      case 'game':      return a.game.localeCompare(b.game) * dir;
      case 'qty':       return (a.quantity - b.quantity) * dir;
      case 'unit_sale': return (a.unit_sale_price_cents - b.unit_sale_price_cents) * dir;
      case 'total':     return (a.total_sale_cents - b.total_sale_cents) * dir;
      case 'cogs':      return (a.cogs_cents - b.cogs_cents) * dir;
      case 'profit':    return (a.gross_profit_cents - b.gross_profit_cents) * dir;
      case 'platform':  return (a.sale_platform ?? '').localeCompare(b.sale_platform ?? '') * dir;
      default:          return 0;
    }
  });

  function toggleSort(k: string) {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  }

  const totalRevenue = sorted.reduce((s, x) => s + x.total_sale_cents, 0);
  const totalCogs    = sorted.reduce((s, x) => s + x.cogs_cents, 0);
  const totalProfit  = totalRevenue - totalCogs;
  const totalUnits   = sorted.reduce((s, x) => s + x.quantity, 0);

  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name / set / platform / notes…"
          className="flex-1 min-w-[240px] max-w-xs border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-700"
        >
          <option value="">All types</option>
          {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select
          value={platformFilter}
          onChange={e => setPlatformFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-700"
        >
          <option value="">All platforms</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="text-xs text-gray-500 flex items-center gap-1">
          From
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700"
          />
        </label>
        <label className="text-xs text-gray-500 flex items-center gap-1">
          To
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700"
          />
        </label>
        <span className="text-xs text-gray-500 ml-auto">
          {sorted.length} of {items.length} {items.length === 1 ? 'sale' : 'sales'}
        </span>
      </div>

      {/* Totals cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">Units sold</div>
          <div className="text-lg font-bold text-gray-900">{totalUnits}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">Revenue</div>
          <div className="text-lg font-bold text-gray-900">{formatCents(totalRevenue)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">COGS</div>
          <div className="text-lg font-bold text-amber-600">{formatCents(totalCogs)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">Gross profit</div>
          <div className={`text-lg font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {formatCents(totalProfit)}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
              <SortHeader label="Sold"      k="sold_at"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Item"      k="name"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Game"      k="game"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="col-game" />
              <th className="pb-2 pr-3 font-medium col-type">Type</th>
              <SortHeader label="Qty"       k="qty"       sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-qty" />
              <SortHeader label="Unit $"    k="unit_sale" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-unit_sale"
                          hint="Per-unit sale price recorded on the sale row." />
              <SortHeader label="Total"     k="total"     sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-total"
                          hint="quantity × unit sale price." />
              <SortHeader label="COGS"      k="cogs"      sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-cogs"
                          hint="Cost of goods sold = quantity × unit_cost_basis of the specific source purchase lot. Specific-lot method (not FIFO-averaged)." />
              <SortHeader label="Gross P"   k="profit"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="text-right col-profit"
                          hint="Total − COGS. Does not include shipping / fees / platform cuts — do those separately in your tax filing." />
              <SortHeader label="Platform"  k="platform"  sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="col-platform" />
              <th className="pb-2 font-medium col-purchased">Purchased</th>
              <th className="pb-2 font-medium col-notes">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={12} className="py-8 text-center text-gray-400 text-sm">
                  No sales in this filter.
                </td>
              </tr>
            )}
            {sorted.map(s => {
              const profitPct = s.cogs_cents > 0 ? (s.gross_profit_cents / s.cogs_cents) * 100 : null;
              return (
                <tr key={s.sale_id} className="hover:bg-gray-50">
                  <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">{s.sold_at}</td>
                  <td className="py-2 pr-3">
                    <div className="text-gray-900">{s.name}</div>
                    {s.set_name && <div className="text-xs text-gray-500">{s.set_name}</div>}
                  </td>
                  <td className="py-2 pr-3 text-gray-500 uppercase text-xs col-game">{s.game}</td>
                  <td className="py-2 pr-3 text-gray-500 text-xs col-type">{s.item_type}</td>
                  <td className="py-2 pr-3 text-right font-mono text-gray-700 col-qty">{s.quantity}</td>
                  <td className="py-2 pr-3 text-right font-mono text-gray-700 col-unit_sale">{formatCents(s.unit_sale_price_cents)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-gray-900 col-total">{formatCents(s.total_sale_cents)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-amber-600 col-cogs">{formatCents(s.cogs_cents)}</td>
                  <td className={`py-2 pr-3 text-right font-mono col-profit ${s.gross_profit_cents >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {formatCents(s.gross_profit_cents)}
                    {profitPct != null && (
                      <div className="text-xs opacity-70">{(profitPct >= 0 ? '+' : '') + profitPct.toFixed(0)}%</div>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-gray-600 text-xs col-platform">{s.sale_platform ?? '—'}</td>
                  <td className="py-2 pr-3 text-gray-500 text-xs whitespace-nowrap col-purchased">{s.purchased_at}</td>
                  <td className="py-2 pr-3 text-gray-500 text-xs max-w-[200px] whitespace-normal col-notes">{s.sale_notes ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
          {sorted.length > 0 && (
            <tfoot className="border-t-2 border-gray-300 font-semibold text-sm">
              <tr>
                <td colSpan={4} className="py-2 pr-3 text-gray-500 text-xs uppercase tracking-wider">Totals (filtered)</td>
                <td className="py-2 pr-3 text-right font-mono">{totalUnits}</td>
                <td></td>
                <td className="py-2 pr-3 text-right font-mono">{formatCents(totalRevenue)}</td>
                <td className="py-2 pr-3 text-right font-mono text-amber-700">{formatCents(totalCogs)}</td>
                <td className={`py-2 pr-3 text-right font-mono ${totalProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {formatCents(totalProfit)}
                </td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

export default function ManifestPage() {
  const [tab, setTab] = useState<Tab>('inventory');
  const [game, setGame] = useState('');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [platforms, setPlatforms] = useState<string[]>(DEFAULT_PLATFORMS);
  const [summary, setSummary] = useState<ManifestSummary | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsGroup[]>([]);
  const [groupBy, setGroupBy] = useState<AnalyticsGroupBy>('item_type');
  const [inventoryGroup, setInventoryGroup] = useState<InventoryGroup>('sku');
  const [inventorySearch, setInventorySearch] = useState('');
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
      } else if (tab === 'sales') {
        setSales(await listSales(game || undefined));
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

  const refreshPlatforms = useCallback(() => {
    listPlatforms().then(fromDB => {
      // Union of seeded suggestions + platforms already in use, dedup'd
      // case-insensitively (prefer the DB casing when both exist).
      const seen = new Set<string>();
      const merged: string[] = [];
      for (const p of [...fromDB, ...DEFAULT_PLATFORMS]) {
        const k = p.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push(p);
      }
      setPlatforms(merged);
    }).catch(() => {});
  }, []);

  useEffect(() => { refreshPlatforms(); }, [refreshPlatforms]);

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
    <div className="max-w-6xl mx-auto manifest-root">
      {/* Print-only stylesheet: keeps the manifest table visible, drops everything else. */}
      <style>{`
        @media print {
          @page { size: letter landscape; margin: 10mm; }
          body * { visibility: hidden; }
          .manifest-root, .manifest-root * { visibility: visible; }
          .manifest-root { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print, .no-print * { display: none !important; visibility: hidden !important; }
          /* Compact table */
          .manifest-root table { border-collapse: collapse; font-size: 9px; width: 100%; }
          .manifest-root th, .manifest-root td { padding: 2px 4px !important; vertical-align: top; }
          .manifest-root tbody tr { border-bottom: 1px solid #eee; }
          .manifest-root .shadow-sm { box-shadow: none !important; }
          /* Hide filter controls (they're inputs/selects), but click-to-edit
             buttons in cells still need to show their value — un-button them. */
          .manifest-root input, .manifest-root select, .manifest-root textarea { display: none !important; }
          .manifest-root td button {
            all: unset !important;
            display: inline !important;
            color: inherit !important;
            font-size: inherit !important;
            padding: 0 !important;
            border: none !important;
          }
          /* Product image column is expensive to print — shrink or hide */
          .manifest-root td img { width: 18px !important; height: 18px !important; }
          .manifest-root a { color: black; text-decoration: none; }
          .print-timestamp { display: block !important; font-size: 9px; color: #666; margin-bottom: 6px; }
          /* Column-picker: hide any column whose header/cell is tagged with .print-hide */
          .manifest-root .print-hide { display: none !important; }
        }
        .print-timestamp { display: none; }
      `}</style>

      <div className="print-timestamp">
        FG-Collect Manifest — printed {new Date().toLocaleString()}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Manifest</h1>
          <p className="text-xs text-gray-500 mt-0.5">Purchase &amp; sale ledger · inventory is derived</p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <PrintControls tab={tab} />
          <select
            value={game}
            onChange={e => setGame(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All games</option>
            {GAMES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </div>
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
            <div className="text-xs text-gray-500 mb-1" title="Annualized return, computed twice: assuming market prices (top) vs the 85% liquidation haircut (bottom).">Portfolio XIRR</div>
            {summary?.portfolio_xirr != null ? (
              <div className={`text-lg font-bold ${summary.portfolio_xirr >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                {(summary.portfolio_xirr >= 0 ? '+' : '') + (summary.portfolio_xirr * 100).toFixed(1) + '%'}
                <span className="text-xs text-gray-400 font-normal ml-1">mkt</span>
              </div>
            ) : (
              <div className="text-lg font-bold text-gray-300">—</div>
            )}
            {summary?.portfolio_xirr_liq != null && (
              <div className={`text-xs font-medium mt-0.5 ${summary.portfolio_xirr_liq >= 0 ? 'text-blue-600 opacity-80' : 'text-red-500 opacity-80'}`}>
                {(summary.portfolio_xirr_liq >= 0 ? '+' : '') + (summary.portfolio_xirr_liq * 100).toFixed(1) + '%'} <span className="text-gray-400">liq</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add purchase */}
      <div className="no-print">
        <AddPurchaseForm onAdded={() => { load(); refreshPlatforms(); }} platforms={platforms} />
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between mb-4 mt-4 border-b border-gray-200">
        <div className="flex gap-1">
          {(['inventory', 'purchases', 'sales', 'analytics'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'inventory' ? 'Inventory'
                : t === 'purchases' ? 'All Purchases'
                : t === 'sales' ? 'All Sales'
                : 'Analytics'}
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
        <InventoryTable
          items={inventory}
          onRefresh={() => { load(); refreshPlatforms(); }}
          platforms={platforms}
          search={inventorySearch}
          setSearch={setInventorySearch}
          onSwitchToLotView={(q) => {
            if (q) setInventorySearch(q);
            setInventoryGroup('lot');
          }}
        />
      ) : tab === 'purchases' ? (
        <PurchasesTable items={purchases} onRefresh={() => { load(); refreshPlatforms(); }} platforms={platforms} />
      ) : tab === 'sales' ? (
        <SalesTable items={sales} />
      ) : (
        <AnalyticsTable groups={analytics} />
      )}
    </div>
  );
}

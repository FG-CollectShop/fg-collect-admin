import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adjustStock,
  listListings,
  softDeleteListing,
  type Listing,
  type ListingsPage,
  type ListingType,
} from "@/api/listings";
import { listPlatforms } from "@/api/manifest";
import { BreakDownModal } from "./BreakDownModal";
import type { Game } from "@/api/catalog";

const GAMES: { value: "" | Game; label: string }[] = [
  { value: "", label: "All games" },
  { value: "pokemon", label: "Pokémon" },
  { value: "magic", label: "Magic" },
  { value: "weiss", label: "Weiß" },
];

const TYPES: { value: "" | ListingType; label: string }[] = [
  { value: "", label: "All" },
  { value: "single", label: "Singles" },
  { value: "sealed", label: "Sealed" },
  { value: "graded", label: "Graded" },
];

const PAGE_SIZE = 50;

const DEFAULT_PLATFORMS = ["TCGPlayer", "ManaPool", "Storefront", "eBay", "In person"];

function fmtPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function InventoryPage() {
  const navigate = useNavigate();
  const [game, setGame] = useState<"" | Game>("");
  const [type, setType] = useState<"" | ListingType>("");
  const [offset, setOffset] = useState(0);
  const [selling, setSelling] = useState<Listing | null>(null);
  const [breaking, setBreaking] = useState<Listing | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const qc = useQueryClient();
  const queryKey = ["listings", game, type, offset];

  const q = useQuery<ListingsPage, Error>({
    queryKey,
    queryFn: () =>
      listListings({
        game: game || undefined,
        type: type || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  const platformsQ = useQuery<string[], Error>({
    queryKey: ["platforms"],
    queryFn: listPlatforms,
    staleTime: 60_000,
  });

  const platforms = (() => {
    const fromDB = platformsQ.data ?? [];
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const p of [...fromDB, ...DEFAULT_PLATFORMS]) {
      const k = p.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(p);
    }
    return merged;
  })();

  const adjustMu = useMutation({
    mutationFn: (vars: { id: string; delta: number; reason?: string }) =>
      adjustStock(vars.id, vars.delta, vars.reason ?? "admin manual adjust"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["listings"] }),
  });

  const deleteMu = useMutation({
    mutationFn: (id: string) => softDeleteListing(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["listings"] }),
  });

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">
            Everything you have for sale. Click "Add" to intake a new card or sealed product.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => {
                const ids = Array.from(selected).join(",");
                navigate(`/inventory/print?ids=${ids}`);
              }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              🖨 Print {selected.size} label{selected.size !== 1 ? "s" : ""}
            </button>
          )}
          <Link
            to="/inventory/new"
            className="px-4 py-2 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800"
          >
            + Add inventory
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center mb-4">
        <select
          value={game}
          onChange={(e) => { setGame(e.target.value as "" | Game); setOffset(0); }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-md"
        >
          {GAMES.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => { setType(e.target.value as "" | ListingType); setOffset(0); }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-md"
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {q.isLoading && <SkeletonRows />}

      {q.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {q.error.message}
        </div>
      )}

      {q.isSuccess && q.data.items.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center text-gray-500">
          No inventory yet.
          <div className="mt-3">
            <Link
              to="/inventory/new"
              className="inline-block px-4 py-2 bg-black text-white text-sm rounded-md hover:bg-gray-800"
            >
              Add your first item
            </Link>
          </div>
        </div>
      )}

      {q.isSuccess && q.data.items.length > 0 && (
        <>
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === q.data.items.length && q.data.items.length > 0}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(q.data.items.map((i) => i.id)) : new Set())
                      }
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="text-left px-3 py-2"></th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Set</th>
                  <th className="text-left px-3 py-2">Game</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Bin</th>
                  <th className="text-right px-3 py-2">Stock</th>
                  <th className="text-right px-3 py-2">Price</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {q.data.items.map((l) => (
                  <Row
                    key={l.id}
                    listing={l}
                    checked={selected.has(l.id)}
                    onCheck={(v) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        v ? next.add(l.id) : next.delete(l.id);
                        return next;
                      })
                    }
                    onAdjust={(delta) => adjustMu.mutate({ id: l.id, delta })}
                    onSell={() => setSelling(l)}
                    onBreak={l.type === "sealed" ? () => setBreaking(l) : undefined}
                    onDelete={() => {
                      if (confirm(`Soft-delete "${l.name}"?`)) deleteMu.mutate(l.id);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <div className="text-gray-500">
              Showing {offset + 1}–{offset + q.data.items.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
                className="px-3 py-1.5 border border-gray-300 rounded disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={q.data.items.length < PAGE_SIZE}
                className="px-3 py-1.5 border border-gray-300 rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {breaking && (
        <BreakDownModal listing={breaking} onClose={() => setBreaking(null)} />
      )}

      {selling && (
        <SellModal
          listing={selling}
          platforms={platforms}
          onClose={() => setSelling(null)}
          onSold={(qty, price, platform, notes) => {
            const parts = [`sold ${qty}×${fmtPrice(price)}`];
            if (platform) parts.push(`via ${platform}`);
            if (notes) parts.push(notes);
            adjustMu.mutate(
              { id: selling.id, delta: -qty, reason: parts.join(" — ") },
              { onSuccess: () => setSelling(null) },
            );
          }}
        />
      )}
    </div>
  );
}

// ── Sell Modal ────────────────────────────────────────────────────────────────

function SellModal({
  listing,
  platforms,
  onClose,
  onSold,
}: {
  listing: Listing;
  platforms: string[];
  onClose: () => void;
  onSold: (qty: number, priceCents: number, platform: string, notes: string) => void;
}) {
  const [form, setForm] = useState({
    qty: "1",
    price: (listing.price_cents / 100).toFixed(2),
    platform: "",
    date: today(),
    notes: "",
  });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Math.max(1, parseInt(form.qty) || 1);
    const priceCents = Math.round(parseFloat(form.price) * 100) || 0;
    onSold(qty, priceCents, form.platform, form.notes);
  }

  const inputCls =
    "w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
  const labelCls = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <form
        onSubmit={submit}
        className="bg-white border border-gray-200 rounded-lg shadow-lg p-5 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Record Sale</h3>
        <p className="text-xs text-gray-500 mb-4">
          {listing.name} · {listing.stock} in stock
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelCls}>Qty *</label>
            <input
              required
              type="number"
              min="1"
              max={listing.stock}
              value={form.qty}
              onChange={set("qty")}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Sale price / unit ($) *</label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={set("price")}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={form.date} onChange={set("date")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Platform</label>
            <input
              list="sell-platform-list"
              value={form.platform}
              onChange={set("platform")}
              placeholder="e.g. TCGPlayer"
              className={inputCls}
            />
            <datalist id="sell-platform-list">
              {platforms.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
        </div>

        <div className="mb-4">
          <label className={labelCls}>Notes</label>
          <input
            type="text"
            value={form.notes}
            onChange={set("notes")}
            placeholder="Optional"
            className={inputCls}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={listing.stock === 0}
            className="px-4 py-1.5 text-sm bg-black text-white rounded hover:bg-gray-800 disabled:opacity-40"
          >
            Record sale
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function Row({
  listing,
  checked,
  onCheck,
  onAdjust,
  onSell,
  onBreak,
  onDelete,
}: {
  listing: Listing;
  checked: boolean;
  onCheck: (v: boolean) => void;
  onAdjust: (delta: number) => void;
  onSell: () => void;
  onBreak?: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-2 w-8">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          className="rounded border-gray-300"
        />
      </td>
      <td className="px-3 py-2 w-12">
        {listing.image_url && (
          <img src={listing.image_url} alt="" className="w-8 h-11 object-contain rounded" />
        )}
      </td>
      <td className="px-3 py-2 font-medium truncate max-w-[260px]">{listing.name}</td>
      <td className="px-3 py-2 text-gray-500">{listing.set_name ?? "—"}</td>
      <td className="px-3 py-2 text-gray-500">{listing.game}</td>
      <td className="px-3 py-2 text-gray-500">{listing.type}</td>
      <td className="px-3 py-2 text-gray-500">
        {listing.location ?? "—"}
        <Link
          to={`/where?q=${encodeURIComponent(listing.name)}`}
          className="block text-xs text-gray-400 hover:text-black underline"
        >
          where?
        </Link>
      </td>
      <td className="px-3 py-2 text-right font-mono">{listing.stock}</td>
      <td className="px-3 py-2 text-right font-mono">{fmtPrice(listing.price_cents)}</td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            title="−1 stock"
            onClick={() => onAdjust(-1)}
            disabled={listing.stock === 0}
            className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40"
          >
            −
          </button>
          <button
            type="button"
            title="+1 stock"
            onClick={() => onAdjust(1)}
            className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100"
          >
            +
          </button>
          <button
            type="button"
            onClick={onSell}
            disabled={listing.stock === 0}
            className="px-2 py-0.5 text-xs border border-green-600 text-green-700 rounded hover:bg-green-50 disabled:opacity-40"
          >
            Sell
          </button>
          {onBreak && (
            <button
              type="button"
              onClick={onBreak}
              disabled={listing.stock === 0}
              className="px-2 py-0.5 text-xs border border-blue-500 text-blue-700 rounded hover:bg-blue-50 disabled:opacity-40"
            >
              Break
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="ml-1 px-2 py-0.5 text-xs text-gray-500 hover:text-red-600 underline"
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}

function SkeletonRows() {
  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-12 border-b border-gray-100 last:border-0 bg-gray-50 animate-pulse" />
      ))}
    </div>
  );
}

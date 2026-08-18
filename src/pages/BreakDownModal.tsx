import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { adjustStock, createListing, type Listing } from "@/api/listings";
import {
  listPurchasesForListing,
  transformPurchase,
  type LinkedPurchase,
} from "@/api/manifest";

// Standard break ratios by product_type.
const BREAK_DEFAULTS: Record<string, { outputItemType: string; qty: number; nameSuffix: string }> = {
  booster_box:           { outputItemType: "booster_pack",     qty: 36, nameSuffix: "Booster Pack" },
  collector_booster_box: { outputItemType: "booster_pack",     qty: 12, nameSuffix: "Collector Booster Pack" },
  booster_bundle:        { outputItemType: "booster_pack",     qty: 10, nameSuffix: "Booster Pack" },
  etb:                   { outputItemType: "booster_pack",     qty: 9,  nameSuffix: "Booster Pack" },
  elite_trainer_box:     { outputItemType: "booster_pack",     qty: 9,  nameSuffix: "Booster Pack" },
  case:                  { outputItemType: "booster_box",      qty: 6,  nameSuffix: "Booster Box" },
  sealed_display:        { outputItemType: "booster_box",      qty: 6,  nameSuffix: "Booster Box" },
};

function fmtPrice(cents: number) {
  return (cents / 100).toFixed(2);
}

function suggestOutputName(source: Listing, outputSuffix: string): string {
  const setName = source.set_name ?? "";
  return setName ? `${setName} ${outputSuffix}` : outputSuffix;
}

function sourceProductType(l: Listing): string {
  return (l.details as Record<string, unknown>).product_type as string ?? "";
}

export function BreakDownModal({
  listing,
  onClose,
}: {
  listing: Listing;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const pt = sourceProductType(listing);
  const defaults = BREAK_DEFAULTS[pt] ?? { outputItemType: "booster_pack", qty: 36, nameSuffix: "Pack" };

  const [breakQty, setBreakQty] = useState("1");
  const [outName, setOutName] = useState(suggestOutputName(listing, defaults.nameSuffix));
  const [outQtyEach, setOutQtyEach] = useState(String(defaults.qty));
  const [outPrice, setOutPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [lots, setLots] = useState<LinkedPurchase[] | null>(null);
  const [lotsError, setLotsError] = useState("");
  const [selectedLotId, setSelectedLotId] = useState("");

  useEffect(() => {
    listPurchasesForListing(listing.id)
      .then((res) => {
        setLots(res);
        const fifo = res.find((p) => p.quantity_available > 0);
        if (fifo) setSelectedLotId(fifo.id);
      })
      .catch((e) => setLotsError(e instanceof Error ? e.message : "load lots failed"));
  }, [listing.id]);

  const selectedLot = lots?.find((l) => l.id === selectedLotId);
  const linked = lots !== null && lots.length > 0;
  const bqty = Math.max(1, parseInt(breakQty) || 1);
  const oqty = Math.max(1, parseInt(outQtyEach) || 1);
  const totalOutput = bqty * oqty;
  const maxBreakQty = selectedLot ? selectedLot.quantity_available : listing.stock;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (bqty > maxBreakQty) {
      setError(`Only ${maxBreakQty} available to break.`);
      return;
    }
    if (!outName.trim()) {
      setError("Output name is required.");
      return;
    }

    setSaving(true);
    try {
      if (linked && selectedLot) {
        // Ledger path: transform the source purchase into a child purchase.
        const outPriceCents = outPrice
          ? Math.round(parseFloat(outPrice) * 100)
          : undefined;
        await transformPurchase(selectedLot.id, {
          source_qty: bqty,
          output_qty_each: oqty,
          output: {
            name: outName.trim(),
            item_type: defaults.outputItemType,
            game: listing.game,
            unit_cost_basis_cents: outPriceCents,
            // Leave listing_id NULL — user can bind the output to a new listing later.
          },
          notes: `broken down from ${listing.name}`,
        });
      } else {
        // Fallback (unlinked listing): old adjust-stock + createListing path.
        await adjustStock(listing.id, -bqty, `broken down into ${outName}`);
        await createListing({
          type: defaults.outputItemType === "booster_box" ? "sealed" : "single",
          game: listing.game,
          name: outName.trim(),
          set_name: listing.set_name ?? null,
          image_url: listing.image_url ?? null,
          price_cents: outPrice ? Math.round(parseFloat(outPrice) * 100) : listing.price_cents,
          stock: bqty * oqty,
          details: { product_type: defaults.outputItemType },
        });
      }
      qc.invalidateQueries({ queryKey: ["listings"] });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
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
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Break Down</h3>
        <p className="text-xs text-gray-500 mb-3">
          {listing.name} · {listing.stock} in stock
        </p>

        {lots === null && !lotsError && (
          <div className="text-xs text-gray-400 mb-3 animate-pulse">Loading lots…</div>
        )}
        {lotsError && (
          <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            {lotsError}
          </div>
        )}
        {lots && lots.length === 0 && (
          <div className="mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            Not ledger-linked — will use legacy adjust-stock + create-listing flow.
            Link a purchase to this listing (<code>UPDATE purchases SET listing_id = '{listing.id}'…</code>)
            to preserve cost basis across the break.
          </div>
        )}
        {lots && lots.length > 1 && (
          <div className="mb-3">
            <label className={labelCls}>Break from lot (FIFO default)</label>
            <select
              value={selectedLotId}
              onChange={(e) => setSelectedLotId(e.target.value)}
              className={inputCls}
            >
              {lots.map((l) => (
                <option key={l.id} value={l.id} disabled={l.quantity_available === 0}>
                  {l.purchased_at} · {l.quantity_available}/{l.quantity} avail · cost ${fmtPrice(l.unit_cost_basis_cents)}
                </option>
              ))}
            </select>
          </div>
        )}
        {lots && lots.length === 1 && selectedLot && (
          <div className="mb-3 text-xs text-gray-500">
            Lot: {selectedLot.purchased_at} · {selectedLot.quantity_available}/{selectedLot.quantity} avail
            · cost ${fmtPrice(selectedLot.unit_cost_basis_cents)}
          </div>
        )}

        <div className="bg-gray-50 rounded-md p-3 mb-4 text-xs text-gray-700 space-y-0.5">
          <div className="font-medium text-gray-500 uppercase tracking-wider mb-1">Preview</div>
          <div>Break <span className="font-semibold">{bqty}</span> × {listing.name}</div>
          <div className="text-gray-400">→ creates {totalOutput} × {outName || "…"}</div>
          {linked && (
            <div className="text-gray-400">
              cost basis flows{" "}
              <span className="font-mono">
                ${fmtPrice(selectedLot?.unit_cost_basis_cents ?? 0)} → ${fmtPrice(Math.floor((selectedLot?.unit_cost_basis_cents ?? 0) / oqty))}/pack
              </span>
              {outPrice && " (overridden)"}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelCls}>Units to break *</label>
            <input
              required
              type="number"
              min="1"
              max={maxBreakQty}
              value={breakQty}
              onChange={(e) => setBreakQty(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Packs / unit *</label>
            <input
              required
              type="number"
              min="1"
              value={outQtyEach}
              onChange={(e) => setOutQtyEach(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div className="mb-3">
          <label className={labelCls}>Output name *</label>
          <input
            required
            type="text"
            value={outName}
            onChange={(e) => setOutName(e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="mb-4">
          <label className={labelCls}>Cost basis / output unit ($, optional)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={outPrice}
            onChange={(e) => setOutPrice(e.target.value)}
            placeholder={linked ? "auto (source cost / packs)" : fmtPrice(listing.price_cents)}
            className={inputCls}
          />
          <p className="text-xs text-gray-400 mt-1">
            {linked
              ? "Blank = auto-split source cost across outputs."
              : "Blank = use source listing price."}
          </p>
        </div>

        {error && (
          <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
            {error}
          </div>
        )}

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
            disabled={saving || maxBreakQty === 0}
            className="px-4 py-1.5 text-sm bg-black text-white rounded hover:bg-gray-800 disabled:opacity-40"
          >
            {saving ? "Breaking…" : `Break into ${totalOutput} units`}
          </button>
        </div>
      </form>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adjustStock, createListing, type Listing } from "@/api/listings";

// Standard break ratios by product_type.
const BREAK_DEFAULTS: Record<string, { outputType: string; qty: number; nameSuffix: string }> = {
  booster_box:           { outputType: "booster_pack", qty: 36,  nameSuffix: "Booster Pack" },
  collector_booster_box: { outputType: "booster_pack", qty: 12,  nameSuffix: "Collector Booster Pack" },
  booster_bundle:        { outputType: "booster_pack", qty: 10,  nameSuffix: "Booster Pack" },
  etb:                   { outputType: "booster_pack", qty: 9,   nameSuffix: "Booster Pack" },
  elite_trainer_box:     { outputType: "booster_pack", qty: 9,   nameSuffix: "Booster Pack" },
  case:                  { outputType: "sealed",        qty: 6,   nameSuffix: "Booster Box" },
  sealed_display:        { outputType: "sealed",        qty: 6,   nameSuffix: "Booster Box" },
};

function fmtPrice(cents: number) {
  return (cents / 100).toFixed(2);
}

function suggestOutputName(source: Listing, outputSuffix: string): string {
  const setName = source.set_name ?? "";
  return setName ? `${setName} ${outputSuffix}` : outputSuffix;
}

function productType(l: Listing): string {
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
  const pt = productType(listing);
  const defaults = BREAK_DEFAULTS[pt] ?? { outputType: "booster_pack", qty: 36, nameSuffix: "Pack" };

  const [breakQty, setBreakQty] = useState("1");
  const [outName, setOutName] = useState(suggestOutputName(listing, defaults.nameSuffix));
  const [outQtyEach, setOutQtyEach] = useState(String(defaults.qty));
  const [outPrice, setOutPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const adjustMu = useMutation({ mutationFn: ({ id, delta }: { id: string; delta: number }) =>
    adjustStock(id, delta, `broken down into ${outName}`) });

  const createMu = useMutation({ mutationFn: createListing });

  const totalOutput = (parseInt(breakQty) || 1) * (parseInt(outQtyEach) || 1);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const bqty = Math.max(1, parseInt(breakQty) || 1);
    const oqty = Math.max(1, parseInt(outQtyEach) || 1);
    const priceCents = Math.round(parseFloat(outPrice) * 100) || 0;

    if (bqty > listing.stock) {
      setError(`Only ${listing.stock} in stock.`);
      return;
    }
    if (!outName.trim()) {
      setError("Output name is required.");
      return;
    }

    setSaving(true);
    try {
      await adjustMu.mutateAsync({ id: listing.id, delta: -bqty });
      await createMu.mutateAsync({
        type: defaults.outputType === "sealed" ? "sealed" : "single",
        game: listing.game,
        name: outName.trim(),
        set_name: listing.set_name ?? null,
        image_url: listing.image_url ?? null,
        price_cents: priceCents,
        stock: bqty * oqty,
        details: { product_type: defaults.outputType },
      });
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
        <p className="text-xs text-gray-500 mb-4">
          {listing.name} · {listing.stock} in stock
        </p>

        <div className="bg-gray-50 rounded-md p-3 mb-4 text-xs text-gray-700 space-y-0.5">
          <div className="font-medium text-gray-500 uppercase tracking-wider mb-1">Source</div>
          <div>Break <span className="font-semibold">{breakQty || "1"}</span> × {listing.name}</div>
          <div className="text-gray-400">→ creates {totalOutput} × {outName || "…"}</div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelCls}>Units to break *</label>
            <input
              required
              type="number"
              min="1"
              max={listing.stock}
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
          <label className={labelCls}>Output listing name *</label>
          <input
            required
            type="text"
            value={outName}
            onChange={(e) => setOutName(e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="mb-4">
          <label className={labelCls}>Price per output unit ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={outPrice}
            onChange={(e) => setOutPrice(e.target.value)}
            placeholder={fmtPrice(listing.price_cents)}
            className={inputCls}
          />
          <p className="text-xs text-gray-400 mt-1">
            Leave blank to price at ${fmtPrice(listing.price_cents)} (source price).
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
            disabled={saving}
            className="px-4 py-1.5 text-sm bg-black text-white rounded hover:bg-gray-800 disabled:opacity-40"
          >
            {saving ? "Breaking…" : `Break into ${totalOutput} units`}
          </button>
        </div>
      </form>
    </div>
  );
}

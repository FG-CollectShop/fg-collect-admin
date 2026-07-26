import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLot, listLots, lotRoi, updateLot,
  type AllocationMethod, type SourceType,
} from "@/api/sourcing";

const sources: { value: SourceType; label: string }[] = [
  { value: "collection_buy", label: "Collection buy" },
  { value: "estate", label: "Estate" },
  { value: "lgs", label: "LGS" },
  { value: "tcgplayer", label: "TCGplayer" },
  { value: "ebay", label: "eBay" },
  { value: "auction_house", label: "Auction house" },
  { value: "wholesale", label: "Wholesale" },
  { value: "trade", label: "Trade" },
  { value: "rip", label: "Box rip" },
  { value: "gift", label: "Gift" },
  { value: "other", label: "Other" },
];

function fmt(c: number) {
  const sign = c < 0 ? "-" : "";
  return `${sign}$${(Math.abs(c) / 100).toFixed(2)}`;
}

export function AcquisitionsPage() {
  const { id } = useParams();
  return id ? <LotDetail id={id} /> : <LotsList />;
}

function LotsList() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lots"], queryFn: () => listLots(false) });
  const [showForm, setShowForm] = useState(false);
  const createMu = useMutation({
    mutationFn: createLot,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lots"] });
      setShowForm(false);
    },
  });

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Acquisitions</h1>
          <p className="text-sm text-gray-500 mt-1">
            Each lot is one purchase event. Tag intaken cards to a lot to
            track ROI as you sell them piece-meal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-black text-white text-sm font-medium rounded"
        >
          + Record lot
        </button>
      </div>

      {showForm && (
        <LotForm
          onCancel={() => setShowForm(false)}
          onSubmit={(b) => createMu.mutate(b)}
          submitting={createMu.isPending}
          error={createMu.error ? (createMu.error as Error).message : undefined}
        />
      )}

      {q.isSuccess && q.data.items.length === 0 && !showForm && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-10 text-center text-gray-500">
          No acquisition lots yet.
        </div>
      )}

      {q.isSuccess && q.data.items.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Source</th>
                <th className="text-right px-3 py-2">Cost</th>
                <th className="text-left px-3 py-2">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {q.data.items.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{l.acquired_at}</td>
                  <td className="px-3 py-2 font-medium">
                    <Link to={`/acquisitions/${l.id}`} className="hover:underline">
                      {l.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {l.source_type}{l.source_name ? ` · ${l.source_name}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(l.total_cost_cents)}</td>
                  <td className="px-3 py-2 text-xs">
                    {l.closed
                      ? <span className="px-2 py-0.5 bg-gray-100 rounded">Closed</span>
                      : <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded">Open</span>
                    }
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link to={`/acquisitions/${l.id}`} className="text-xs text-gray-500 hover:text-black underline">
                      ROI →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LotDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["lot-roi", id], queryFn: () => lotRoi(id) });
  const closeMu = useMutation({
    mutationFn: (closed: boolean) => updateLot(id, { closed }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lot-roi", id] }),
  });

  if (q.isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (q.isError) return <p className="text-sm text-red-600">{(q.error as Error).message}</p>;
  if (!q.isSuccess) return null;
  const r = q.data;
  const lot = r.lot;
  const totalGain = r.realized_gain_cents;
  const breakeven = r.realized_revenue_cents - lot.total_cost_cents;

  return (
    <div>
      <div className="mb-2 text-sm">
        <Link to="/acquisitions" className="text-gray-500 hover:text-black">← All lots</Link>
      </div>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{lot.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {lot.acquired_at} · {lot.source_type}
            {lot.source_name && ` · ${lot.source_name}`}
            {lot.notes && <span className="block mt-1 text-gray-600">{lot.notes}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => closeMu.mutate(!lot.closed)}
          className="px-3 py-1.5 border border-gray-300 text-sm rounded hover:bg-gray-50"
        >
          {lot.closed ? "Reopen lot" : "Close lot"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Total cost" value={fmt(lot.total_cost_cents)} />
        <Stat label="Realized revenue" value={fmt(r.realized_revenue_cents)} />
        <Stat
          label="Realized gain"
          value={fmt(totalGain)}
          tone={totalGain > 0 ? "good" : totalGain < 0 ? "bad" : "neutral"}
        />
        <Stat
          label={breakeven >= 0 ? "Past break-even" : "To break even"}
          value={fmt(Math.abs(breakeven))}
          tone={breakeven >= 0 ? "good" : "bad"}
        />
        <Stat label="Items in lot" value={String(r.item_count)} />
        <Stat label="Sold" value={`${r.sold_count} / ${r.item_count}`} />
        <Stat label="Outstanding @ ask" value={fmt(r.outstanding_at_ask_cents)} />
        <Stat label="Outstanding @ cost" value={fmt(r.outstanding_at_cost_cents)} />
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-2">
        Items in this lot
      </h2>
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-right px-3 py-2">Cost</th>
              <th className="text-right px-3 py-2">Ask</th>
              <th className="text-right px-3 py-2">Sold</th>
              <th className="text-right px-3 py-2">Gain</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {r.listings.map((l) => (
              <tr key={l.listing_id}>
                <td className="px-3 py-2 font-medium truncate max-w-[280px]">{l.name}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{l.type}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(l.allocated_cost_cents)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-500">
                  {l.active ? fmt(l.price_cents) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {l.sold_quantity ? fmt(l.sold_cents ?? 0) : "—"}
                </td>
                <td className={`px-3 py-2 text-right font-mono ${
                  (l.realized_gain_cents ?? 0) > 0 ? "text-green-700"
                  : (l.realized_gain_cents ?? 0) < 0 ? "text-red-600"
                  : "text-gray-400"
                }`}>
                  {l.realized_gain_cents != null ? fmt(l.realized_gain_cents) : "—"}
                </td>
              </tr>
            ))}
            {r.listings.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                No listings tagged to this lot yet. Use the lot picker on the
                Graded intake page or tag existing inventory to attach items.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "neutral" }) {
  const cls =
    tone === "good" ? "text-green-700"
    : tone === "bad" ? "text-red-600"
    : "text-gray-900";
  return (
    <div className="border border-gray-200 rounded-lg bg-white p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold font-mono ${cls}`}>{value}</div>
    </div>
  );
}

function LotForm({
  onCancel, onSubmit, submitting, error,
}: {
  onCancel: () => void;
  onSubmit: (b: Parameters<typeof createLot>[0]) => void;
  submitting: boolean;
  error?: string;
}) {
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("collection_buy");
  const [sourceName, setSourceName] = useState("");
  const [acquiredAt, setAcquiredAt] = useState(new Date().toISOString().slice(0, 10));
  const [item, setItem] = useState("0");
  const [shipping, setShipping] = useState("0");
  const [fees, setFees] = useState("0");
  const [other, setOther] = useState("0");
  const [allocation, setAllocation] = useState<AllocationMethod>("even");
  const [notes, setNotes] = useState("");

  const dollars = (s: string) => Math.round(parseFloat(s || "0") * 100);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          source_type: sourceType,
          source_name: sourceName || undefined,
          acquired_at: acquiredAt,
          item_cost_cents: dollars(item),
          shipping_cents: dollars(shipping),
          fees_cents: dollars(fees),
          other_cost_cents: dollars(other),
          currency: "USD",
          allocation_method: allocation,
          notes: notes || undefined,
        });
      }}
      className="mb-6 border border-gray-200 rounded-lg bg-white p-5"
    >
      <h2 className="font-semibold mb-4">Record acquisition lot</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label="Name *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Craigslist Pokémon collection"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
        <Field label="Source">
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as SourceType)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Source name / contact">
          <input
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="John Doe / PWCC #4521"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
        <Field label="Acquired at">
          <input
            type="date"
            value={acquiredAt}
            onChange={(e) => setAcquiredAt(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
        <Field label="Item cost ($)">
          <input
            type="number" step="0.01" min={0}
            value={item} onChange={(e) => setItem(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
        <Field label="Shipping ($)">
          <input
            type="number" step="0.01" min={0}
            value={shipping} onChange={(e) => setShipping(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
        <Field label="Fees ($)">
          <input
            type="number" step="0.01" min={0}
            value={fees} onChange={(e) => setFees(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
        <Field label="Other ($) — gas, supplies">
          <input
            type="number" step="0.01" min={0}
            value={other} onChange={(e) => setOther(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
        <Field label="Cost allocation">
          <select
            value={allocation}
            onChange={(e) => setAllocation(e.target.value as AllocationMethod)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            <option value="even">Even split</option>
            <option value="manual">Manual per-item</option>
            <option value="weighted">Weighted</option>
          </select>
        </Field>
        <div className="md:col-span-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex gap-2">
        <button
          type="submit"
          disabled={submitting || !name}
          className="px-4 py-2 bg-black text-white text-sm rounded disabled:opacity-40"
        >
          {submitting ? "Creating…" : "Create lot"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-sm rounded hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

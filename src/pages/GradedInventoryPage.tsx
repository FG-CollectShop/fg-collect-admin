import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listGraded, type GradedRow, type GradingCompany } from "@/api/graded";
import { downloadEbayGradedCSV } from "@/api/export";
import type { Game } from "@/api/catalog";

const games: { value: "" | Game; label: string }[] = [
  { value: "", label: "All games" },
  { value: "pokemon", label: "Pokémon" },
  { value: "magic", label: "Magic" },
  { value: "weiss", label: "Weiß" },
];
const companies: { value: "" | GradingCompany; label: string }[] = [
  { value: "", label: "All graders" },
  { value: "psa", label: "PSA" },
  { value: "bgs", label: "BGS" },
  { value: "sgc", label: "SGC" },
  { value: "cgc", label: "CGC" },
];

const PAGE_SIZE = 100;

function fmtPrice(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

export function GradedInventoryPage() {
  const [game, setGame] = useState<"" | Game>("");
  const [company, setCompany] = useState<"" | GradingCompany>("");
  const [gradeMin, setGradeMin] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);

  const q = useQuery({
    queryKey: ["graded", game, company, gradeMin, offset],
    queryFn: () =>
      listGraded({
        game: game || undefined,
        grading_company: company || undefined,
        grade_min: gradeMin ? parseFloat(gradeMin) : undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  async function handleExport() {
    setExporting(true);
    try {
      const { blob, filename } = await downloadEbayGradedCSV({
        game: game || undefined,
        grading_company: company || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Graded inventory</h1>
          <p className="text-sm text-gray-500 mt-1">
            All slabs across PSA / BGS / SGC / CGC. Use filters to scope, then
            export the eBay CSV for bulk listing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || (q.data?.items.length ?? 0) === 0}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded hover:bg-gray-50 disabled:opacity-40"
          >
            {exporting ? "Exporting…" : "Export eBay CSV"}
          </button>
          <Link
            to="/inventory/graded/new"
            className="px-4 py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800"
          >
            + Intake slabs
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center mb-4">
        <select
          value={game}
          onChange={(e) => {
            setGame(e.target.value as "" | Game);
            setOffset(0);
          }}
          className="px-3 py-2 text-sm border border-gray-300 rounded"
        >
          {games.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
        <select
          value={company}
          onChange={(e) => {
            setCompany(e.target.value as "" | GradingCompany);
            setOffset(0);
          }}
          className="px-3 py-2 text-sm border border-gray-300 rounded"
        >
          {companies.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <label className="text-sm text-gray-700 flex items-center gap-2">
          Min grade
          <input
            type="number"
            min={0}
            max={10}
            step="0.5"
            value={gradeMin}
            onChange={(e) => {
              setGradeMin(e.target.value);
              setOffset(0);
            }}
            className="w-20 px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </label>
      </div>

      {q.isLoading && <SkeletonRows />}
      {q.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {(q.error as Error).message}
        </div>
      )}
      {q.isSuccess && q.data.items.length === 0 && (
        <EmptyState />
      )}
      {q.isSuccess && q.data.items.length > 0 && (
        <>
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 w-16"></th>
                  <th className="text-left px-3 py-2">Card</th>
                  <th className="text-left px-3 py-2">Cert</th>
                  <th className="text-left px-3 py-2">Grade</th>
                  <th className="text-left px-3 py-2">Pop</th>
                  <th className="text-left px-3 py-2">Bin</th>
                  <th className="text-right px-3 py-2">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {q.data.items.map((g) => <Row key={g.listing_id} g={g} />)}
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
    </div>
  );
}

function Row({ g }: { g: GradedRow }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-2">
        {g.front_image_url ? (
          <img src={g.front_image_url} alt="" className="w-10 h-14 object-contain rounded" />
        ) : (
          <div className="w-10 h-14 bg-gray-100 rounded" />
        )}
      </td>
      <td className="px-3 py-2">
        <div className="font-medium truncate max-w-[280px]">
          {[g.year || null, g.brand, g.subject].filter(Boolean).join(" ") || g.name}
        </div>
        <div className="text-xs text-gray-500">
          {g.card_number && `#${g.card_number}`}
          {g.variety && ` · ${g.variety}`}
        </div>
      </td>
      <td className="px-3 py-2 font-mono text-xs text-gray-600">
        {g.company.toUpperCase()} {g.cert_number}
      </td>
      <td className="px-3 py-2">
        <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-xs font-semibold">
          {g.grade_label || g.grade}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-gray-500">
        {g.population_equal != null && (
          <>
            {g.population_equal} @ this grade
            <br />
            {g.population_higher ?? 0} higher
          </>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-gray-500">{g.location || "—"}</td>
      <td className="px-3 py-2 text-right font-mono">{fmtPrice(g.price_cents)}</td>
    </tr>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center text-gray-500">
      No graded slabs yet.
      <div className="mt-3">
        <Link
          to="/inventory/graded/new"
          className="inline-block px-4 py-2 bg-black text-white text-sm rounded hover:bg-gray-800"
        >
          Intake your first batch
        </Link>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-14 border-b border-gray-100 last:border-0 bg-gray-50 animate-pulse" />
      ))}
    </div>
  );
}

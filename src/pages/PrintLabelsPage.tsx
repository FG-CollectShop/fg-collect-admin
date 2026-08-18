import { useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { getListing, type Listing } from "@/api/listings";

// Label size: roughly 2.5" × 1" — three columns per A4/Letter row.
// Switch to .label-dymo for a single-column Dymo 30252 (1⅛" × 3½") sheet.

function fmtPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function gradeLabel(l: Listing): string | null {
  const d = l.details as Record<string, unknown>;
  if (l.type !== "graded" || !d.grading_company) return null;
  return `${String(d.grading_company).toUpperCase()} ${d.grade ?? ""}`.trim();
}

function conditionBadge(l: Listing): string | null {
  const d = l.details as Record<string, unknown>;
  return (d.condition as string) ?? null;
}

function Label({ listing: l }: { listing: Listing }) {
  const grade = gradeLabel(l);
  const cond = conditionBadge(l);

  return (
    <div className="label-card print:break-inside-avoid">
      <div className="label-name">{l.name}</div>
      <div className="label-set">{[l.set_name, l.game].filter(Boolean).join(" · ")}</div>
      <div className="label-meta">
        {grade && <span className="label-badge label-badge-dark">{grade}</span>}
        {!grade && cond && <span className="label-badge">{cond}</span>}
        {l.location && <span className="label-bin">📦 {l.location}</span>}
      </div>
      <div className="label-price">{fmtPrice(l.price_cents)}</div>
      <div className="label-id">{l.id.slice(0, 8).toUpperCase()}</div>
    </div>
  );
}

export function PrintLabelsPage() {
  const [params] = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean);

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["listing", id],
      queryFn: () => getListing(id),
    })),
  });

  const listings = results.flatMap((r) => (r.data ? [r.data] : []));
  const loading = results.some((r) => r.isLoading);
  const errors = results.filter((r) => r.isError).length;

  return (
    <>
      {/* Print stylesheet injected inline so this page is self-contained */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-sheet, #print-sheet * { visibility: visible; }
          #print-sheet { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 10mm; }
        }

        .label-card {
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 6px 8px;
          background: white;
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-family: system-ui, sans-serif;
          page-break-inside: avoid;
        }
        .label-name {
          font-weight: 700;
          font-size: 11px;
          line-height: 1.2;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .label-set {
          font-size: 9px;
          color: #6b7280;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .label-meta {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          align-items: center;
          margin-top: 1px;
        }
        .label-badge {
          font-size: 8px;
          padding: 0 4px;
          background: #f3f4f6;
          border-radius: 3px;
          font-weight: 600;
        }
        .label-badge-dark {
          background: #111;
          color: #fff;
        }
        .label-bin {
          font-size: 8px;
          color: #6b7280;
        }
        .label-price {
          font-size: 14px;
          font-weight: 800;
          margin-top: auto;
          padding-top: 4px;
        }
        .label-id {
          font-size: 7px;
          color: #9ca3af;
          font-family: monospace;
          letter-spacing: 0.05em;
        }
      `}</style>

      <div className="no-print max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Print Labels</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {ids.length} label{ids.length !== 1 ? "s" : ""} · 3-up sheet
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={loading || listings.length === 0}
              className="px-4 py-1.5 text-sm bg-black text-white rounded hover:bg-gray-800 disabled:opacity-40"
            >
              Print
            </button>
          </div>
        </div>

        {loading && (
          <div className="text-sm text-gray-500 animate-pulse">Loading listings…</div>
        )}
        {errors > 0 && (
          <div className="text-sm text-red-600 mb-3">
            {errors} listing{errors !== 1 ? "s" : ""} could not be loaded.
          </div>
        )}
      </div>

      <div
        id="print-sheet"
        className="max-w-4xl mx-auto px-4 pb-10 grid gap-3"
        style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
      >
        {listings.map((l) => (
          <Label key={l.id} listing={l} />
        ))}
      </div>
    </>
  );
}

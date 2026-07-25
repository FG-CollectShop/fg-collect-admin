import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { whereIs, placeListing, type SearchResult } from "@/api/storage";

export function WhereIsPage() {
  const [params] = useSearchParams();
  const initialQ = params.get("q") ?? "";
  const [q, setQ] = useState(initialQ);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string>("");
  const [movingFor, setMovingFor] = useState<string | null>(null);
  const [moveBin, setMoveBin] = useState("");

  // Auto-search when arriving via deep link (?q=…)
  useEffect(() => {
    if (initialQ) {
      whereIs(initialQ).then(setResult).catch((e) => setError((e as Error).message));
    }
  }, [initialQ]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!q.trim()) return;
    try {
      setResult(await whereIs(q.trim()));
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    }
  }

  const moveMu = useMutation({
    mutationFn: (vars: { listing_id: string; bin_code: string }) =>
      placeListing({ listing_id: vars.listing_id, bin_code: vars.bin_code }),
    onSuccess: async () => {
      setMovingFor(null);
      setMoveBin("");
      // Re-run search to refresh placement
      if (q.trim()) setResult(await whereIs(q.trim()));
    },
  });

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight">Where is…?</h1>
      <p className="text-sm text-gray-500 mt-1">
        Type a card name, a PSA cert number, or a bin code. Returns the
        current location for matching items, or the contents of a scanned bin.
      </p>

      <form onSubmit={search} className="mt-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Charizard / 12345678 / B-0042"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded"
          autoFocus
        />
        <button
          type="submit"
          disabled={!q.trim()}
          className="px-4 py-2 bg-black text-white text-sm rounded disabled:opacity-40"
        >
          Search
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result?.bin && (
        <div className="mt-6 border border-gray-200 rounded-lg bg-white p-4">
          <div className="text-xs text-gray-500 font-mono mb-1">Bin {result.bin.code}</div>
          <div className="text-lg font-semibold">{result.bin.label || result.bin.code}</div>
          <div className="text-xs text-gray-500 mt-1">{result.bin.path}</div>
        </div>
      )}

      {result && result.listings.length > 0 && (
        <div className="mt-6 border border-gray-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 w-12"></th>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-left px-3 py-2">Currently at</th>
                <th className="text-right px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {result.listings.map((l) => (
                <tr key={l.listing_id}>
                  <td className="px-3 py-2">
                    {l.image_url && (
                      <img src={l.image_url} alt="" className="w-8 h-11 object-contain rounded" />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium truncate max-w-[280px]">{l.name}</div>
                    <div className="text-xs text-gray-500">{l.game} · {l.type}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {l.bin_code ? (
                      <>
                        <div className="font-mono">{l.bin_code}</div>
                        <div className="text-gray-500">{l.bin_path}</div>
                      </>
                    ) : (
                      <span className="text-amber-600">Unplaced</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {movingFor === l.listing_id ? (
                      <div className="inline-flex items-center gap-1">
                        <input
                          value={moveBin}
                          onChange={(e) => setMoveBin(e.target.value)}
                          placeholder="bin code"
                          className="w-32 px-2 py-1 text-xs border border-gray-300 rounded font-mono"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => moveMu.mutate({ listing_id: l.listing_id, bin_code: moveBin.trim() })}
                          disabled={!moveBin.trim() || moveMu.isPending}
                          className="px-2 py-1 text-xs bg-black text-white rounded disabled:opacity-40"
                        >
                          Place
                        </button>
                        <button
                          type="button"
                          onClick={() => { setMovingFor(null); setMoveBin(""); }}
                          className="text-xs text-gray-400"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setMovingFor(l.listing_id)}
                        className="text-xs text-gray-500 hover:text-black underline"
                      >
                        Move
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && result.listings.length === 0 && !result.bin && (
        <p className="mt-6 text-sm text-gray-500">No matches.</p>
      )}
    </div>
  );
}

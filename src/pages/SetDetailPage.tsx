import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listSetCards, listSets, type Card, type Set as CardSet } from "@/api/catalog";

export function SetDetailPage() {
  const { id = "" } = useParams();
  const [filter, setFilter] = useState("");

  // Reuses the cached `["sets", ""]` query when the user came from /sets.
  const setsQ = useQuery<CardSet[], Error>({
    queryKey: ["sets", ""],
    queryFn: () => listSets(),
    staleTime: 60_000,
  });
  const set = useMemo(() => setsQ.data?.find((s) => s.id === id), [setsQ.data, id]);

  const cardsQ = useQuery<Card[], Error>({
    queryKey: ["set-cards", id],
    queryFn: () => listSetCards(id),
    enabled: !!id,
  });

  const filtered = useMemo(() => {
    if (!cardsQ.data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return cardsQ.data;
    return cardsQ.data.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.number.toLowerCase().includes(q) ||
        (c.rarity ?? "").toLowerCase().includes(q),
    );
  }, [cardsQ.data, filter]);

  return (
    <div>
      <nav className="text-sm text-gray-500 mb-3">
        <Link to="/sets" className="hover:text-black">Sets</Link>
        <span className="mx-1">/</span>
        <span>{set?.name ?? id}</span>
      </nav>

      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {set?.name ?? "Loading…"}
          </h1>
          {set && (
            <div className="mt-1 text-sm text-gray-500 flex items-center gap-3">
              <span className="px-1.5 py-0.5 bg-gray-100 rounded">{set.game}</span>
              <code className="text-xs">{set.code}</code>
              {set.release_date && <span>{set.release_date}</span>}
              {typeof set.card_count === "number" && (
                <span>{set.card_count} cards</span>
              )}
            </div>
          )}
        </div>
        <input
          type="search"
          placeholder="Filter by name / number / rarity…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-md w-72"
        />
      </div>

      {cardsQ.isLoading && (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] bg-gray-100 rounded-lg animate-pulse"
            />
          ))}
        </div>
      )}

      {cardsQ.isError && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {cardsQ.error.message}
        </div>
      )}

      {cardsQ.isSuccess && filtered.length === 0 && (
        <div className="mt-6 text-center text-gray-500 py-12 border-2 border-dashed border-gray-200 rounded-lg">
          {cardsQ.data.length === 0
            ? "No cards in this set yet. The catalog scraper hasn't populated it — check the workers binary."
            : "No cards match the filter."}
        </div>
      )}

      {cardsQ.isSuccess && filtered.length > 0 && (
        <div className="mt-6">
          <div className="text-xs text-gray-500 mb-2">
            {filtered.length} of {cardsQ.data.length} cards
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {filtered.map((c) => (
              <article
                key={c.id}
                className="border border-gray-200 rounded-lg overflow-hidden bg-white"
                title={c.name}
              >
                <div className="aspect-[3/4] bg-gray-50 flex items-center justify-center overflow-hidden">
                  {c.image_url ? (
                    <img
                      src={c.image_url}
                      alt={c.name}
                      loading="lazy"
                      className="object-contain w-full h-full"
                    />
                  ) : (
                    <div className="text-xs text-gray-400">No image</div>
                  )}
                </div>
                <div className="p-2">
                  <div className="text-xs font-medium truncate">{c.name}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5 truncate">
                    {c.number}
                    {c.rarity ? ` · ${c.rarity}` : ""}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

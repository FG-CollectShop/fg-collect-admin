import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSets, type Game, type Set as CardSet } from "@/api/catalog";
import { ApiError } from "@/api/client";

const games: { value: "" | Game; label: string }[] = [
  { value: "", label: "All games" },
  { value: "pokemon", label: "Pokémon" },
  { value: "magic", label: "Magic" },
  { value: "weiss", label: "Weiß Schwarz" },
];

export function SetsPage() {
  const [game, setGame] = useState<"" | Game>("");

  const q = useQuery<CardSet[], Error>({
    queryKey: ["sets", game],
    queryFn: () => listSets(game === "" ? undefined : game),
  });

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sets</h1>
          <p className="text-sm text-gray-500 mt-1">
            Master catalog of every set you carry. Hydrated from Scryfall (Magic) and
            pokemontcg.io (Pokémon) by the workers binary.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={game}
            onChange={(e) => setGame(e.target.value as "" | Game)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md"
          >
            {games.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>
      </div>

      {q.isLoading && <SkeletonGrid />}

      {q.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="font-semibold">Couldn't load sets</div>
          <div className="mt-1 text-red-800">
            {q.error instanceof ApiError
              ? `${q.error.status} — ${q.error.message}`
              : q.error.message}
          </div>
        </div>
      )}

      {q.isSuccess && q.data.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center text-gray-500">
          <div className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            No sets yet
          </div>
          <p className="mt-3 max-w-xl mx-auto">
            The catalog is empty. Either the scraper jobs haven't run yet, or this build
            of core has no catalog data. Check the workers binary and the
            <code className="mx-1 px-1 bg-gray-100 rounded">scryfall-set-sync</code> /
            <code className="mx-1 px-1 bg-gray-100 rounded">pokemon-tcg-set-sync</code>
            jobs.
          </p>
        </div>
      )}

      {q.isSuccess && q.data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {q.data.map((s) => (
            <div
              key={s.id}
              className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-semibold truncate">{s.name}</div>
                <code className="text-xs text-gray-500">{s.code}</code>
              </div>
              <div className="mt-2 text-xs text-gray-500 flex items-center gap-3">
                <span className="px-1.5 py-0.5 bg-gray-100 rounded">{s.game}</span>
                {s.release_date && <span>{s.release_date}</span>}
                {typeof s.card_count === "number" && <span>{s.card_count} cards</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-20 border border-gray-200 rounded-lg bg-gray-100 animate-pulse" />
      ))}
    </div>
  );
}

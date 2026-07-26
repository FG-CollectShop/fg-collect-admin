import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listPortfolioSets, type SetSummary } from "@/api/portfolio";

const GAME_LABELS: Record<string, string> = {
  pokemon:   "Pokémon",
  mtg:       "Magic",
  weiss:     "Weiß",
  lorcana:   "Lorcana",
  one_piece: "One Piece",
  yugioh:    "Yu-Gi-Oh",
};

export function PortfolioSetsPage() {
  const { game = "" } = useParams<{ game: string }>();
  const gameLabel = GAME_LABELS[game] ?? game;

  const q = useQuery<SetSummary[], Error>({
    queryKey: ["portfolio", "sets", game],
    queryFn: () => listPortfolioSets(game),
    enabled: !!game,
  });

  const owned = q.data?.filter((s) => s.owned_count > 0) ?? [];
  const notOwned = q.data?.filter((s) => s.owned_count === 0) ?? [];

  return (
    <div>
      <nav className="text-sm text-gray-500 mb-4">
        <Link to="/portfolio" className="hover:text-black">Portfolio</Link>
        <span className="mx-1">/</span>
        <span className="text-gray-900 font-medium">{gameLabel}</span>
      </nav>

      <div className="flex items-end justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{gameLabel} — Sets</h1>
        {q.isSuccess && (
          <span className="text-sm text-gray-400">
            {owned.length} / {q.data!.length} sets with cards
          </span>
        )}
      </div>

      {q.isLoading && <SetsSkeleton />}

      {q.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {q.error.message}
        </div>
      )}

      {q.isSuccess && q.data.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center text-gray-500">
          No sets found for {gameLabel}.
        </div>
      )}

      {q.isSuccess && q.data.length > 0 && (
        <>
          {owned.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                In collection
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {owned.map((s) => <SetCard key={s.id} set={s} game={game} />)}
              </div>
            </section>
          )}

          {notOwned.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                Not collected
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {notOwned.map((s) => <SetCard key={s.id} set={s} game={game} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SetCard({ set, game }: { set: SetSummary; game: string }) {
  const pct = set.card_count && set.card_count > 0
    ? Math.min(100, Math.round((set.owned_count / set.card_count) * 100))
    : 0;
  const hasCards = set.owned_count > 0;

  return (
    <Link
      to={`/portfolio/${game}/${set.id}`}
      className={`rounded-lg border bg-white hover:shadow-md transition-shadow overflow-hidden flex flex-col ${
        hasCards ? "border-gray-300" : "border-gray-200 opacity-60 hover:opacity-100"
      }`}
    >
      {/* Set image */}
      <div className="bg-gray-100 h-28 flex items-center justify-center p-2">
        {set.image_url ? (
          <img
            src={set.image_url}
            alt={set.name}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="text-2xl text-gray-300">🃏</div>
        )}
      </div>

      {/* Set info */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="text-sm font-semibold leading-tight line-clamp-2">{set.name}</div>
        {set.release_date && (
          <div className="text-xs text-gray-400">{set.release_date.slice(0, 4)}</div>
        )}

        {/* Progress bar */}
        {set.card_count ? (
          <div className="mt-auto pt-1">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{set.owned_count} / {set.card_count}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  pct === 100 ? "bg-green-500" : pct > 0 ? "bg-blue-500" : "bg-gray-300"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-400 mt-auto">
            {set.owned_count > 0 ? `${set.owned_count} owned` : "none"}
          </div>
        )}
      </div>
    </Link>
  );
}

function SetsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-gray-200 h-52 animate-pulse bg-gray-50" />
      ))}
    </div>
  );
}

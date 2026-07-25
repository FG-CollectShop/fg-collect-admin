import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listPortfolioGames, type GameSummary } from "@/api/portfolio";

const GAME_META: Record<string, { label: string; emoji: string; color: string }> = {
  pokemon:   { label: "Pokémon",   emoji: "⚡", color: "bg-yellow-50 border-yellow-200" },
  mtg:       { label: "Magic",     emoji: "🔮", color: "bg-purple-50 border-purple-200" },
  weiss:     { label: "Weiß",      emoji: "🌸", color: "bg-pink-50   border-pink-200"   },
  lorcana:   { label: "Lorcana",   emoji: "✨", color: "bg-blue-50   border-blue-200"   },
  one_piece: { label: "One Piece", emoji: "🏴‍☠️", color: "bg-red-50    border-red-200"    },
  yugioh:    { label: "Yu-Gi-Oh",  emoji: "👁", color: "bg-amber-50  border-amber-200"  },
};

function fmtCost(cents: number) {
  if (cents === 0) return null;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PortfolioGamesPage() {
  const q = useQuery<GameSummary[], Error>({
    queryKey: ["portfolio", "games"],
    queryFn: listPortfolioGames,
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
        <p className="text-sm text-gray-500 mt-1">
          Browse your collection by game. Click a game to see sets.
        </p>
      </div>

      {q.isLoading && <GamesSkeleton />}

      {q.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {q.error.message}
        </div>
      )}

      {q.isSuccess && q.data.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-16 text-center text-gray-500">
          <p className="text-lg font-medium">No inventory yet</p>
          <p className="mt-2 text-sm">Add items via <Link to="/inventory/new" className="underline hover:text-black">Inventory → Add</Link>.</p>
        </div>
      )}

      {q.isSuccess && q.data.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {q.data.map((g) => (
            <GameCard key={g.game} summary={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function GameCard({ summary }: { summary: GameSummary }) {
  const meta = GAME_META[summary.game] ?? {
    label: summary.game,
    emoji: "🃏",
    color: "bg-gray-50 border-gray-200",
  };
  const cost = fmtCost(summary.total_cost_cents);

  return (
    <Link
      to={`/portfolio/${summary.game}`}
      className={`rounded-xl border-2 p-6 flex flex-col gap-3 hover:shadow-md transition-shadow ${meta.color}`}
    >
      <div className="text-4xl">{meta.emoji}</div>
      <div>
        <div className="font-bold text-lg leading-tight">{meta.label}</div>
        <div className="text-sm text-gray-500 mt-0.5">
          {summary.listing_count.toLocaleString()} listing{summary.listing_count !== 1 ? "s" : ""}
        </div>
        {cost && (
          <div className="text-xs text-gray-400 mt-1">Cost basis {cost}</div>
        )}
      </div>
    </Link>
  );
}

function GamesSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border-2 border-gray-200 p-6 h-36 animate-pulse bg-gray-50" />
      ))}
    </div>
  );
}

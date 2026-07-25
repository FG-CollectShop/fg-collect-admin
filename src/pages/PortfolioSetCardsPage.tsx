import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listPortfolioSetCards, type PortfolioCard } from "@/api/portfolio";
import { listSets } from "@/api/catalog";

const GAME_LABELS: Record<string, string> = {
  pokemon:   "Pokémon",
  mtg:       "Magic",
  weiss:     "Weiß",
  lorcana:   "Lorcana",
  one_piece: "One Piece",
  yugioh:    "Yu-Gi-Oh",
};

const INTENT_LABELS: Record<string, string> = {
  for_sale:      "For Sale",
  investment:    "Investment",
  pending_grade: "Pending Grade",
};

type Filter = "all" | "owned" | "missing";

export function PortfolioSetCardsPage() {
  const { game = "", setId = "" } = useParams<{ game: string; setId: string }>();
  const gameLabel = GAME_LABELS[game] ?? game;
  const [filter, setFilter] = useState<Filter>("all");

  const cardsQ = useQuery<PortfolioCard[], Error>({
    queryKey: ["portfolio", "set", setId, "cards"],
    queryFn: () => listPortfolioSetCards(setId),
    enabled: !!setId,
  });

  const setsQ = useQuery({
    queryKey: ["catalog", "sets", game],
    queryFn: () => listSets(game as never),
    enabled: !!game,
  });

  const setName = setsQ.data?.find((s) => s.id === setId)?.name ?? "Set";

  const cards = cardsQ.data ?? [];
  const filtered =
    filter === "owned"   ? cards.filter((c) => c.owned_qty > 0) :
    filter === "missing" ? cards.filter((c) => c.owned_qty === 0) :
    cards;

  const ownedCount = cards.filter((c) => c.owned_qty > 0).length;
  const totalCount = cards.length;

  return (
    <div>
      <nav className="text-sm text-gray-500 mb-4">
        <Link to="/portfolio" className="hover:text-black">Portfolio</Link>
        <span className="mx-1">/</span>
        <Link to={`/portfolio/${game}`} className="hover:text-black">{gameLabel}</Link>
        <span className="mx-1">/</span>
        <span className="text-gray-900 font-medium">{setName}</span>
      </nav>

      <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{setName}</h1>
          {cardsQ.isSuccess && (
            <p className="text-sm text-gray-500 mt-1">
              {ownedCount} / {totalCount} cards owned
            </p>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex gap-2">
          {(["all", "owned", "missing"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                filter === f
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {f === "all" ? "All" : f === "owned" ? `Owned (${ownedCount})` : `Missing (${totalCount - ownedCount})`}
            </button>
          ))}
        </div>
      </div>

      {cardsQ.isLoading && <CardsSkeleton />}

      {cardsQ.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {cardsQ.error.message}
        </div>
      )}

      {cardsQ.isSuccess && filtered.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center text-gray-500">
          {filter === "owned" ? "You don't own any cards from this set yet." : "No cards match this filter."}
        </div>
      )}

      {cardsQ.isSuccess && filtered.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {filtered.map((card) => (
            <CardTile key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardTile({ card }: { card: PortfolioCard }) {
  const owned = card.owned_qty > 0;
  const market = card.market_price_cents != null
    ? `$${(card.market_price_cents / 100).toFixed(2)}`
    : null;
  const intentLabel = card.intent ? INTENT_LABELS[card.intent] : null;

  return (
    <div
      className={`relative rounded-lg overflow-hidden border bg-white transition-opacity ${
        owned ? "border-gray-300 shadow-sm" : "border-gray-200 opacity-40"
      }`}
      title={`${card.name} #${card.number}${card.rarity ? ` · ${card.rarity}` : ""}${market ? ` · ${market}` : ""}`}
    >
      {/* Card image */}
      <div className="bg-gray-100 aspect-[2.5/3.5] flex items-center justify-center">
        {card.image_url ? (
          <img
            src={card.image_url}
            alt={card.name}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="text-gray-300 text-2xl">🃏</div>
        )}
      </div>

      {/* Owned qty badge */}
      {owned && (
        <div className="absolute top-1 right-1">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold shadow">
            {card.owned_qty > 9 ? "9+" : card.owned_qty}
          </span>
        </div>
      )}

      {/* Intent badge */}
      {owned && card.intent && card.intent !== "for_sale" && (
        <div className="absolute top-1 left-1">
          <span className={`px-1 py-0.5 rounded text-[9px] font-bold shadow ${
            card.intent === "investment"    ? "bg-green-600 text-white" :
            card.intent === "pending_grade" ? "bg-amber-500 text-white" :
            "bg-gray-600 text-white"
          }`}>
            {card.intent === "investment" ? "INV" : "GRAD"}
          </span>
        </div>
      )}

      {/* Name + number */}
      <div className="p-1.5">
        <div className="text-[10px] font-medium leading-tight truncate">{card.name}</div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[9px] text-gray-400">#{card.number}</span>
          {market && <span className="text-[9px] text-gray-500">{market}</span>}
        </div>
      </div>
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-gray-200 aspect-[2.5/3.5] animate-pulse bg-gray-100" />
      ))}
    </div>
  );
}

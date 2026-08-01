import { fetchAPI } from "./client";

export interface GameSummary {
  game: string;
  listing_count: number;
  total_cost_cents: number;
}

export interface SetSummary {
  id: string;
  game: string;
  code: string;
  name: string;
  series?: string;
  release_date?: string;
  card_count?: number;
  image_url?: string;
  owned_count: number;
}

export type Intent = "for_sale" | "investment" | "pending_grade";

export interface PortfolioCard {
  id: string;
  number: string;
  name: string;
  rarity?: string;
  image_url?: string;
  display_key?: string;
  details: Record<string, unknown>;
  owned_qty: number;
  listing_id?: string;
  price_cents?: number;
  intent?: Intent;
  market_price_cents?: number;
}

export async function listPortfolioGames(): Promise<GameSummary[]> {
  const res = await fetchAPI<{ games: GameSummary[] }>("/api/v1/portfolio/games");
  return res.games ?? [];
}

export async function listPortfolioSets(game: string): Promise<SetSummary[]> {
  const res = await fetchAPI<{ sets: SetSummary[] }>(
    `/api/v1/portfolio/sets?game=${encodeURIComponent(game)}`,
  );
  return res.sets ?? [];
}

export async function listPortfolioSetCards(setId: string): Promise<PortfolioCard[]> {
  const res = await fetchAPI<{ cards: PortfolioCard[] }>(
    `/api/v1/portfolio/sets/${setId}/cards`,
  );
  return res.cards ?? [];
}

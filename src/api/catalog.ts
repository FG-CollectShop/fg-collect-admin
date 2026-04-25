import { fetchAPI } from "./client";

export type Game = "pokemon" | "magic" | "weiss";

export interface Set {
  id: string;
  game: Game;
  code: string;
  name: string;
  release_date?: string;
  card_count?: number;
  image_url?: string;
  external_ids: Record<string, unknown>;
}

export interface Card {
  id: string;
  set_id: string;
  set_code?: string;
  set_name?: string;
  number: string;
  name: string;
  rarity?: string;
  image_url?: string;
  tcgplayer_product_id?: number;
  details: Record<string, unknown>;
}

export async function listSets(game?: Game): Promise<Set[]> {
  const qs = game ? `?game=${encodeURIComponent(game)}` : "";
  const res = await fetchAPI<{ sets: Set[] }>(`/api/v1/catalog/sets${qs}`);
  return res.sets;
}

export async function listSetCards(setId: string): Promise<Card[]> {
  const res = await fetchAPI<{ cards: Card[] }>(`/api/v1/catalog/sets/${setId}/cards`);
  return res.cards;
}

export async function searchCards(q: string, game?: Game, limit = 20): Promise<Card[]> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  if (game) params.set("game", game);
  const res = await fetchAPI<{ cards: Card[] }>(`/api/v1/catalog/cards/search?${params}`);
  return res.cards;
}

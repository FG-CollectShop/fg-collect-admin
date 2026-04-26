import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CardAutocomplete } from "@/components/CardAutocomplete";
import { type Card, type Game } from "@/api/catalog";
import { ApiError } from "@/api/client";
import {
  createListing,
  type CreateListingInput,
  type Listing,
  type ListingType,
} from "@/api/listings";

const GAMES: { value: Game; label: string }[] = [
  { value: "pokemon", label: "Pokémon" },
  { value: "magic", label: "Magic" },
  { value: "weiss", label: "Weiß" },
];

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
const LANGUAGES = ["EN", "JP", "DE", "FR", "ES", "IT", "PT", "KR", "ZH"] as const;

const SEALED_TYPES = [
  "booster_pack",
  "booster_box",
  "elite_trainer_box",
  "bundle",
  "collection_box",
  "starter_deck",
  "trial_deck",
  "draft_booster",
  "set_booster",
  "collector_booster",
  "play_booster",
  "other",
] as const;

export function InventoryNewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [type, setType] = useState<ListingType>("single");
  const [game, setGame] = useState<Game>("pokemon");

  // Single-only state
  const [card, setCard] = useState<Card | null>(null);
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]>("NM");
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]>("EN");
  const [foil, setFoil] = useState(false);

  // Sealed-only state
  const [sealedName, setSealedName] = useState("");
  const [sealedSetName, setSealedSetName] = useState("");
  const [sealedType, setSealedType] = useState<(typeof SEALED_TYPES)[number]>("booster_box");
  const [sealedTcgpProductID, setSealedTcgpProductID] = useState("");

  // Common
  const [priceUSD, setPriceUSD] = useState("");
  const [stock, setStock] = useState("1");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mu = useMutation<Listing, Error, CreateListingInput>({
    mutationFn: createListing,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["listings"] });
      navigate("/inventory");
    },
    onError: (e) => {
      setError(e instanceof ApiError ? `${e.status} — ${e.message}` : e.message);
    },
  });

  function buildSinglePayload(): CreateListingInput | string {
    if (!card) return "Pick a card from the catalog first.";
    const priceCents = Math.round(parseFloat(priceUSD) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) return "Price must be a positive number.";
    const s = parseInt(stock, 10);
    if (!Number.isFinite(s) || s < 0) return "Stock must be a non-negative integer.";

    return {
      type: "single",
      game,
      tcgplayer_product_id: card.tcgplayer_product_id ?? null,
      name: card.name,
      set_name: card.set_name ?? null,
      image_url: card.image_url ?? null,
      price_cents: priceCents,
      stock: s,
      location: location.trim() || null,
      details: {
        card_id: card.id,
        number: card.number,
        rarity: card.rarity,
        condition,
        language,
        foil,
      },
    };
  }

  function buildSealedPayload(): CreateListingInput | string {
    if (!sealedName.trim()) return "Sealed product needs a name.";
    const priceCents = Math.round(parseFloat(priceUSD) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) return "Price must be a positive number.";
    const s = parseInt(stock, 10);
    if (!Number.isFinite(s) || s < 0) return "Stock must be a non-negative integer.";

    const tcgp = sealedTcgpProductID.trim() ? parseInt(sealedTcgpProductID, 10) : NaN;

    return {
      type: "sealed",
      game,
      tcgplayer_product_id: Number.isFinite(tcgp) ? tcgp : null,
      name: sealedName.trim(),
      set_name: sealedSetName.trim() || null,
      image_url: null,
      price_cents: priceCents,
      stock: s,
      location: location.trim() || null,
      details: { product_type: sealedType },
    };
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = type === "single" ? buildSinglePayload() : buildSealedPayload();
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    mu.mutate(payload);
  }

  return (
    <div className="max-w-3xl">
      <nav className="text-sm text-gray-500 mb-3">
        <Link to="/inventory" className="hover:text-black">Inventory</Link>
        <span className="mx-1">/</span>
        <span>New</span>
      </nav>
      <h1 className="text-2xl font-bold tracking-tight">Add inventory</h1>
      <p className="text-sm text-gray-500 mt-1">
        Intake a single card or a sealed product. Singles autocomplete from the catalog —
        if a card isn't found, the catalog scrapers haven't synced its set yet.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        {/* Type + game */}
        <fieldset className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <div className="flex gap-2">
              {(["single", "sealed"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 px-3 py-2 text-sm border rounded ${
                    type === t
                      ? "bg-black text-white border-black"
                      : "border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {t === "single" ? "Single card" : "Sealed product"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Game">
            <select
              value={game}
              onChange={(e) => setGame(e.target.value as Game)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
            >
              {GAMES.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </Field>
        </fieldset>

        {/* Type-specific block */}
        {type === "single" ? (
          <>
            <Field label="Card">
              <CardAutocomplete
                game={game}
                selected={card}
                onSelect={setCard}
                placeholder="Type at least 2 letters of the card name…"
              />
            </Field>

            <fieldset className="grid grid-cols-3 gap-4">
              <Field label="Condition">
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as (typeof CONDITIONS)[number])}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                >
                  {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Language">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as (typeof LANGUAGES)[number])}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                >
                  {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="Foil">
                <label className="inline-flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={foil}
                    onChange={(e) => setFoil(e.target.checked)}
                  />
                  <span className="text-sm">Foil / holo</span>
                </label>
              </Field>
            </fieldset>
          </>
        ) : (
          <>
            <Field label="Product name">
              <input
                type="text"
                value={sealedName}
                onChange={(e) => setSealedName(e.target.value)}
                placeholder="e.g. Crown Zenith Elite Trainer Box"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              />
            </Field>
            <fieldset className="grid grid-cols-2 gap-4">
              <Field label="Set name">
                <input
                  type="text"
                  value={sealedSetName}
                  onChange={(e) => setSealedSetName(e.target.value)}
                  placeholder="e.g. Crown Zenith"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                />
              </Field>
              <Field label="Sealed product type">
                <select
                  value={sealedType}
                  onChange={(e) =>
                    setSealedType(e.target.value as (typeof SEALED_TYPES)[number])
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                >
                  {SEALED_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </fieldset>
            <Field label="TCGPlayer product ID (optional)">
              <input
                type="number"
                value={sealedTcgpProductID}
                onChange={(e) => setSealedTcgpProductID(e.target.value)}
                placeholder="e.g. 264870"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              />
            </Field>
          </>
        )}

        {/* Common pricing/stock/location */}
        <fieldset className="grid grid-cols-3 gap-4">
          <Field label="Price (USD)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceUSD}
              onChange={(e) => setPriceUSD(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
            />
          </Field>
          <Field label="Stock">
            <input
              type="number"
              min="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
            />
          </Field>
          <Field label="Bin / location">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. B42"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
            />
          </Field>
        </fieldset>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={mu.isPending}
            className="px-5 py-2.5 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 disabled:opacity-40"
          >
            {mu.isPending ? "Saving…" : "Save inventory item"}
          </button>
          <Link to="/inventory" className="text-sm text-gray-500 hover:text-black">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}

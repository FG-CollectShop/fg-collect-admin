import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchCards, type Card, type Game } from "@/api/catalog";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

type Props = {
  game?: Game;
  selected: Card | null;
  onSelect: (card: Card | null) => void;
  placeholder?: string;
};

/**
 * Card name autocomplete that hits /api/v1/catalog/cards/search.
 * Trigram similarity-ranked on the server; debounced 250ms client-side
 * so we don't hammer Postgres on every keystroke.
 */
export function CardAutocomplete({ game, selected, onSelect, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebouncedValue(query, 250);
  const wrapRef = useRef<HTMLDivElement>(null);

  const q = useQuery<Card[], Error>({
    queryKey: ["card-search", debounced, game],
    queryFn: () => searchCards(debounced, game),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  // Close dropdown on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center gap-3 p-2 border border-gray-300 rounded-md bg-gray-50">
        {selected.image_url && (
          <img
            src={selected.image_url}
            alt=""
            className="w-10 h-14 object-contain rounded shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{selected.name}</div>
          <div className="text-xs text-gray-500">
            {selected.set_name ?? selected.set_code} · {selected.number}
            {selected.rarity ? ` · ${selected.rarity}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            setQuery("");
          }}
          className="text-xs text-gray-500 hover:text-red-600 underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? "Search by card name…"}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black/10"
      />
      {open && debounced.length >= 2 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-80 overflow-y-auto">
          {q.isLoading && (
            <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
          )}
          {q.isError && (
            <div className="px-3 py-2 text-xs text-red-600">{q.error.message}</div>
          )}
          {q.isSuccess && q.data.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">No matches.</div>
          )}
          {q.isSuccess &&
            q.data.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => {
                  onSelect(c);
                  setOpen(false);
                  setQuery("");
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-3"
              >
                {c.image_url && (
                  <img
                    src={c.image_url}
                    alt=""
                    className="w-8 h-11 object-contain rounded shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {c.set_name ?? c.set_code} · {c.number}
                    {c.rarity ? ` · ${c.rarity}` : ""}
                  </div>
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

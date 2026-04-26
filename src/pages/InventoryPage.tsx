import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adjustStock,
  listListings,
  softDeleteListing,
  type Listing,
  type ListingsPage,
  type ListingType,
} from "@/api/listings";
import type { Game } from "@/api/catalog";

const games: { value: "" | Game; label: string }[] = [
  { value: "", label: "All games" },
  { value: "pokemon", label: "Pokémon" },
  { value: "magic", label: "Magic" },
  { value: "weiss", label: "Weiß" },
];

const types: { value: "" | ListingType; label: string }[] = [
  { value: "", label: "All" },
  { value: "single", label: "Singles" },
  { value: "sealed", label: "Sealed" },
];

const PAGE_SIZE = 50;

function fmtPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function InventoryPage() {
  const [game, setGame] = useState<"" | Game>("");
  const [type, setType] = useState<"" | ListingType>("");
  const [offset, setOffset] = useState(0);

  const qc = useQueryClient();
  const queryKey = ["listings", game, type, offset];

  const q = useQuery<ListingsPage, Error>({
    queryKey,
    queryFn: () =>
      listListings({
        game: game || undefined,
        type: type || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  const adjustMu = useMutation({
    mutationFn: (vars: { id: string; delta: number }) =>
      adjustStock(vars.id, vars.delta, "admin manual adjust"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["listings"] }),
  });

  const deleteMu = useMutation({
    mutationFn: (id: string) => softDeleteListing(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["listings"] }),
  });

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">
            Everything you have for sale. Click "Add" to intake a new card or sealed product.
          </p>
        </div>
        <Link
          to="/inventory/new"
          className="px-4 py-2 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800"
        >
          + Add inventory
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 items-center mb-4">
        <select
          value={game}
          onChange={(e) => {
            setGame(e.target.value as "" | Game);
            setOffset(0);
          }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-md"
        >
          {games.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as "" | ListingType);
            setOffset(0);
          }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-md"
        >
          {types.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {q.isLoading && <SkeletonRows />}

      {q.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {q.error.message}
        </div>
      )}

      {q.isSuccess && q.data.items.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center text-gray-500">
          No inventory yet.
          <div className="mt-3">
            <Link
              to="/inventory/new"
              className="inline-block px-4 py-2 bg-black text-white text-sm rounded-md hover:bg-gray-800"
            >
              Add your first item
            </Link>
          </div>
        </div>
      )}

      {q.isSuccess && q.data.items.length > 0 && (
        <>
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2"></th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Set</th>
                  <th className="text-left px-3 py-2">Game</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Bin</th>
                  <th className="text-right px-3 py-2">Stock</th>
                  <th className="text-right px-3 py-2">Price</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {q.data.items.map((l) => (
                  <Row
                    key={l.id}
                    listing={l}
                    onAdjust={(delta) => adjustMu.mutate({ id: l.id, delta })}
                    onDelete={() => {
                      if (confirm(`Soft-delete "${l.name}"?`)) deleteMu.mutate(l.id);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <div className="text-gray-500">
              Showing {offset + 1}–{offset + q.data.items.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
                className="px-3 py-1.5 border border-gray-300 rounded disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={q.data.items.length < PAGE_SIZE}
                className="px-3 py-1.5 border border-gray-300 rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  listing,
  onAdjust,
  onDelete,
}: {
  listing: Listing;
  onAdjust: (delta: number) => void;
  onDelete: () => void;
}) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-2 w-12">
        {listing.image_url && (
          <img src={listing.image_url} alt="" className="w-8 h-11 object-contain rounded" />
        )}
      </td>
      <td className="px-3 py-2 font-medium truncate max-w-[260px]">{listing.name}</td>
      <td className="px-3 py-2 text-gray-500">{listing.set_name ?? "—"}</td>
      <td className="px-3 py-2 text-gray-500">{listing.game}</td>
      <td className="px-3 py-2 text-gray-500">{listing.type}</td>
      <td className="px-3 py-2 text-gray-500">{listing.location ?? "—"}</td>
      <td className="px-3 py-2 text-right font-mono">{listing.stock}</td>
      <td className="px-3 py-2 text-right font-mono">{fmtPrice(listing.price_cents)}</td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            title="−1 stock"
            onClick={() => onAdjust(-1)}
            disabled={listing.stock === 0}
            className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40"
          >
            −
          </button>
          <button
            type="button"
            title="+1 stock"
            onClick={() => onAdjust(1)}
            className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100"
          >
            +
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="ml-2 px-2 py-0.5 text-xs text-gray-500 hover:text-red-600 underline"
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}

function SkeletonRows() {
  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-12 border-b border-gray-100 last:border-0 bg-gray-50 animate-pulse" />
      ))}
    </div>
  );
}

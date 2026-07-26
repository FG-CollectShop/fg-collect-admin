import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  binContents, createBin, getBinByCode, listBins,
  type Bin, type BinKind, type Placement,
} from "@/api/storage";

const kinds: { value: BinKind; label: string }[] = [
  { value: "room", label: "Room" },
  { value: "shelf", label: "Shelf" },
  { value: "cabinet", label: "Cabinet" },
  { value: "drawer", label: "Drawer" },
  { value: "tote", label: "Tote" },
  { value: "binder", label: "Binder" },
  { value: "slab_box", label: "Slab box" },
  { value: "top_loader", label: "Top loader" },
  { value: "slot", label: "Slot" },
  { value: "other", label: "Other" },
];

export function BinsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bins"], queryFn: listBins });
  const [showForm, setShowForm] = useState(false);
  const [selectedBin, setSelectedBin] = useState<Bin | null>(null);
  const [scanCode, setScanCode] = useState("");
  const [contents, setContents] = useState<Placement[] | null>(null);
  const [scanError, setScanError] = useState<string>("");

  const createMu = useMutation({
    mutationFn: createBin,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bins"] });
      setShowForm(false);
    },
  });

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    setScanError("");
    try {
      const bin = await getBinByCode(scanCode.trim());
      const c = await binContents(bin.id);
      setSelectedBin(bin);
      setContents(c.items);
    } catch (err) {
      setScanError((err as Error).message);
      setSelectedBin(null);
      setContents(null);
    }
  }

  const tree = useMemo(() => buildTree(q.data?.items ?? []), [q.data]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Bins</h1>
            <p className="text-sm text-gray-500 mt-1">
              Chaos storage. Items go anywhere; bin codes (printable barcodes)
              tell us where.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-black text-white text-sm font-medium rounded"
          >
            + Add bin
          </button>
        </div>

        {showForm && (
          <BinForm
            bins={q.data?.items ?? []}
            onCancel={() => setShowForm(false)}
            onSubmit={(b) => createMu.mutate(b)}
            submitting={createMu.isPending}
            error={createMu.error ? (createMu.error as Error).message : undefined}
          />
        )}

        {q.isSuccess && (
          <ul className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-200 text-sm">
            {tree.length === 0 && (
              <li className="p-6 text-center text-gray-500">
                No bins yet. Create at least one to start placing items.
              </li>
            )}
            {tree.map((node) => (
              <BinNode
                key={node.bin.id}
                node={node}
                depth={0}
                onSelect={async (b) => {
                  setSelectedBin(b);
                  const c = await binContents(b.id);
                  setContents(c.items);
                }}
                selected={selectedBin?.id}
              />
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Scan bin to view contents</h2>
        <form onSubmit={handleScan} className="flex gap-2 mb-4">
          <input
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
            placeholder="Type or scan a bin code (e.g. B-0042)"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded font-mono"
          />
          <button
            type="submit"
            disabled={!scanCode.trim()}
            className="px-4 py-2 bg-black text-white text-sm rounded disabled:opacity-40"
          >
            Look up
          </button>
        </form>
        {scanError && (
          <p className="text-sm text-red-600 mb-3">{scanError}</p>
        )}

        {selectedBin && (
          <div className="border border-gray-200 rounded-lg bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-mono text-sm text-gray-500">
                  {selectedBin.code}
                </div>
                <div className="text-lg font-semibold">
                  {selectedBin.label || selectedBin.code}
                </div>
                <div className="text-xs text-gray-500 capitalize">{selectedBin.kind}</div>
              </div>
              <div className="text-xs text-gray-500">
                {(contents?.length ?? 0)} item{(contents?.length ?? 0) === 1 ? "" : "s"}
              </div>
            </div>
            {contents && contents.length === 0 && (
              <p className="text-sm text-gray-500 italic">Empty</p>
            )}
            <ul className="divide-y divide-gray-100">
              {contents?.map((p) => (
                <li key={p.id} className="py-2 flex items-center gap-3">
                  {p.listing_image && (
                    <img src={p.listing_image} alt="" className="w-8 h-11 object-contain rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.listing_name}</div>
                    <div className="text-xs text-gray-500">
                      {p.listing_game} · {p.listing_type} · qty {p.quantity}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 font-mono">
                    {new Date(p.placed_at).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

interface TreeNode {
  bin: Bin;
  children: TreeNode[];
}

function buildTree(bins: Bin[]): TreeNode[] {
  const byParent = new Map<string | null, Bin[]>();
  for (const b of bins) {
    const key = b.parent_bin_id ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(b);
    byParent.set(key, arr);
  }
  function build(parent: string | null): TreeNode[] {
    return (byParent.get(parent) ?? []).map((bin) => ({
      bin,
      children: build(bin.id),
    }));
  }
  return build(null);
}

function BinNode({
  node, depth, onSelect, selected,
}: {
  node: TreeNode;
  depth: number;
  onSelect: (b: Bin) => void;
  selected?: string;
}) {
  const isSelected = selected === node.bin.id;
  return (
    <>
      <li
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 ${
          isSelected ? "bg-gray-100" : ""
        }`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelect(node.bin)}
      >
        <span className="font-mono text-xs text-gray-500 w-20">{node.bin.code}</span>
        <span className="font-medium truncate">{node.bin.label || node.bin.code}</span>
        <span className="ml-auto text-xs text-gray-400 capitalize">{node.bin.kind}</span>
      </li>
      {node.children.map((c) => (
        <BinNode key={c.bin.id} node={c} depth={depth + 1} onSelect={onSelect} selected={selected} />
      ))}
    </>
  );
}

function BinForm({
  bins, onCancel, onSubmit, submitting, error,
}: {
  bins: Bin[];
  onCancel: () => void;
  onSubmit: (b: Parameters<typeof createBin>[0]) => void;
  submitting: boolean;
  error?: string;
}) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [parent, setParent] = useState("");
  const [kind, setKind] = useState<BinKind>("tote");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          code,
          label: label || null,
          parent_bin_id: parent || null,
          kind,
        });
      }}
      className="mb-4 border border-gray-200 rounded-lg bg-white p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Code *</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            placeholder="B-0042"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as BinKind)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Blue tote on shelf 2"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Parent bin</label>
          <select
            value={parent}
            onChange={(e) => setParent(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            <option value="">(none — top level)</option>
            {bins.map((b) => (
              <option key={b.id} value={b.id}>
                {b.path || b.code}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={submitting || !code}
          className="px-4 py-2 bg-black text-white text-sm rounded disabled:opacity-40"
        >
          {submitting ? "Creating…" : "Create bin"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-sm rounded hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

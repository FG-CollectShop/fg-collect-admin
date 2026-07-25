import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  batchCreateGraded,
  lookupCert,
  type BatchCreateResult,
  type CertInfo,
  type GradingCompany,
  type LookupResponse,
} from "@/api/graded";
import { detectScan, type DetectResponse } from "@/api/scan";
import { listLots } from "@/api/sourcing";
import type { Game } from "@/api/catalog";

// ---- Local UI state ------------------------------------------------------

type CertStatus =
  | "pending"          // detected but not yet looked up
  | "looking_up"
  | "ready"            // looked up, ready to create
  | "duplicate"        // already exists in inventory
  | "lookup_failed"
  | "creating"
  | "created"
  | "create_failed";

interface CertEntry {
  // composite of (company, certNumber) — used as React key.
  key: string;
  company: GradingCompany;
  certNumber: string;
  rawScanUrl?: string;       // batch scan that produced this entry
  rawScanFileName?: string;
  status: CertStatus;
  info?: CertInfo;
  existingListingId?: string;
  errorMessage?: string;
  priceCents: number;
  // tracking fields after batch create
  createdListingId?: string;
}

interface ScanFileState {
  id: string;
  file: File;
  status: "scanning" | "scanned" | "failed";
  url?: string;        // GCS public URL after upload
  detectedCount?: number;
  warning?: string;
  error?: string;
}

// ---- Page ---------------------------------------------------------------

const games: { value: Game; label: string }[] = [
  { value: "pokemon", label: "Pokémon" },
  { value: "magic", label: "Magic" },
  { value: "weiss", label: "Weiß" },
];

const companies: { value: GradingCompany; label: string }[] = [
  { value: "psa", label: "PSA" },
  { value: "bgs", label: "BGS (manual)" },
  { value: "sgc", label: "SGC (manual)" },
  { value: "cgc", label: "CGC (manual)" },
];

export function GradedIntakePage() {
  const [game, setGame] = useState<Game>("pokemon");
  const [defaultCompany, setDefaultCompany] = useState<GradingCompany>("psa");
  const [defaultPrice, setDefaultPrice] = useState<number>(0);
  const [defaultLocation, setDefaultLocation] = useState<string>("");
  const [lotID, setLotID] = useState<string>("");
  const lotsQ = useQuery({ queryKey: ["lots-open"], queryFn: () => listLots(true) });
  const [scans, setScans] = useState<ScanFileState[]>([]);
  const [entries, setEntries] = useState<CertEntry[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchCreateResult[] | null>(null);

  const upsertEntry = useCallback(
    (next: CertEntry) => {
      setEntries((prev) => {
        const i = prev.findIndex((e) => e.key === next.key);
        if (i === -1) return [...prev, next];
        const copy = [...prev];
        copy[i] = { ...copy[i], ...next };
        return copy;
      });
    },
    [],
  );

  const updateEntry = useCallback(
    (key: string, patch: Partial<CertEntry>) => {
      setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
    },
    [],
  );

  const removeEntry = useCallback((key: string) => {
    setEntries((prev) => prev.filter((e) => e.key !== key));
  }, []);

  // Process one file: upload + detect, then look up each detected cert.
  const processFile = useCallback(
    async (file: File) => {
      const id = `${file.name}-${file.size}-${file.lastModified}`;
      setScans((prev) => [...prev, { id, file, status: "scanning" }]);

      let resp: DetectResponse;
      try {
        resp = await detectScan(file);
      } catch (err) {
        setScans((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, status: "failed", error: (err as Error).message }
              : s,
          ),
        );
        return;
      }

      setScans((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                status: "scanned",
                url: resp.url,
                detectedCount: resp.barcodes.length,
                warning: resp.warning,
              }
            : s,
        ),
      );

      // Each detected barcode becomes a candidate cert entry. PSA Code 128
      // barcodes encode the cert number directly, so we trust the value
      // as-is (with a digit-only sanity filter — most valid PSA certs are
      // 8-9 digit numbers).
      for (const bc of resp.barcodes) {
        const certNumber = bc.value.replace(/[^0-9A-Za-z]/g, "");
        if (!certNumber) continue;
        const company = defaultCompany;
        const key = `${company}:${certNumber}`;
        // Skip if we already have this entry (e.g. front + back of same slab
        // both decoded the same value; or two scans of the same slab).
        let existing: CertEntry | undefined;
        setEntries((prev) => {
          existing = prev.find((e) => e.key === key);
          return prev;
        });
        if (existing) continue;

        const initial: CertEntry = {
          key,
          company,
          certNumber,
          rawScanUrl: resp.url,
          rawScanFileName: file.name,
          status: company === "psa" ? "looking_up" : "ready",
          priceCents: defaultPrice,
        };
        upsertEntry(initial);

        if (company === "psa") {
          // Fire and forget; UI re-renders on completion.
          void runLookup(initial, upsertEntry);
        }
      }
    },
    [defaultCompany, defaultPrice, upsertEntry],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/"),
      );
      for (const f of files) void processFile(f);
    },
    [processFile],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      for (const f of files) void processFile(f);
      e.target.value = "";
    },
    [processFile],
  );

  // Manual cert add (typed in by hand).
  const [manualCert, setManualCert] = useState("");
  const addManualCert = useCallback(() => {
    const n = manualCert.trim();
    if (!n) return;
    const key = `${defaultCompany}:${n}`;
    const initial: CertEntry = {
      key,
      company: defaultCompany,
      certNumber: n,
      status: defaultCompany === "psa" ? "looking_up" : "ready",
      priceCents: defaultPrice,
    };
    upsertEntry(initial);
    if (defaultCompany === "psa") void runLookup(initial, upsertEntry);
    setManualCert("");
  }, [manualCert, defaultCompany, defaultPrice, upsertEntry]);

  const readyEntries = useMemo(
    () => entries.filter((e) => e.status === "ready" && !e.createdListingId),
    [entries],
  );

  const createMu = useMutation({
    mutationFn: async () => {
      const items = readyEntries.map((e) => ({
        company: e.company,
        cert_number: e.certNumber,
        price_cents: e.priceCents,
        raw_scan_url: e.rawScanUrl ?? null,
        info: e.info!,
      }));
      // Mark as creating optimistically
      readyEntries.forEach((e) => updateEntry(e.key, { status: "creating" }));
      return batchCreateGraded({
        game,
        location: defaultLocation || null,
        items,
        ...(lotID ? { lot_id: lotID } : {}),
      } as Parameters<typeof batchCreateGraded>[0]);
    },
    onSuccess: (data) => {
      setBatchResults(data.results);
      // Reflect status from results
      for (const r of data.results) {
        const key = entries.find((e) => e.certNumber === r.cert_number)?.key;
        if (!key) continue;
        if (r.status === "created") {
          updateEntry(key, {
            status: "created",
            createdListingId: r.listing_id,
          });
        } else if (r.status === "skipped_duplicate") {
          updateEntry(key, {
            status: "duplicate",
            existingListingId: r.listing_id,
            errorMessage: "Already in inventory",
          });
        } else {
          updateEntry(key, {
            status: "create_failed",
            errorMessage: r.error,
          });
        }
      }
    },
    onError: (err: Error) => {
      readyEntries.forEach((e) =>
        updateEntry(e.key, { status: "create_failed", errorMessage: err.message }),
      );
    },
  });

  const stats = useMemo(() => {
    const counts: Record<CertStatus, number> = {
      pending: 0,
      looking_up: 0,
      ready: 0,
      duplicate: 0,
      lookup_failed: 0,
      creating: 0,
      created: 0,
      create_failed: 0,
    };
    for (const e of entries) counts[e.status]++;
    return counts;
  }, [entries]);

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Graded slab intake</h1>
        <p className="text-sm text-gray-500 mt-1">
          Drop scans of one or more PSA slabs. Barcodes are decoded
          server-side (Cloud Vision); cert metadata + images are pulled from
          PSA's public API. You can drop multiple folders' worth of scans in
          stages — each cert is deduped against existing inventory.
        </p>
      </div>

      {/* Defaults */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Field label="Acquisition lot">
          <select
            value={lotID}
            onChange={(e) => setLotID(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            <option value="">(none — track ROI later)</option>
            {(lotsQ.data?.items ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.acquired_at}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Game">
          <select
            value={game}
            onChange={(e) => setGame(e.target.value as Game)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            {games.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Grader (default)">
          <select
            value={defaultCompany}
            onChange={(e) => setDefaultCompany(e.target.value as GradingCompany)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            {companies.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Default price ($)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={defaultPrice / 100}
            onChange={(e) => setDefaultPrice(Math.round(parseFloat(e.target.value || "0") * 100))}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
        <Field label="Storage location">
          <input
            value={defaultLocation}
            onChange={(e) => setDefaultLocation(e.target.value)}
            placeholder="e.g. binder-3 / safe-A"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
          dragOver
            ? "border-black bg-gray-50"
            : "border-gray-300 bg-white hover:border-gray-400"
        }`}
      >
        <p className="text-sm text-gray-700 mb-3">
          Drag &amp; drop slab scans here, or
        </p>
        <label className="inline-block cursor-pointer px-4 py-2 bg-black text-white text-sm font-medium rounded">
          Choose files
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={onPick}
            className="hidden"
          />
        </label>
        <p className="mt-3 text-xs text-gray-500">
          PNG / JPG, up to 25 MB each. One scan can contain multiple slabs —
          we detect every barcode and dedupe.
        </p>
      </div>

      {/* Manual cert entry (fallback) */}
      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1 max-w-sm">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Or add a cert # manually
          </label>
          <input
            value={manualCert}
            onChange={(e) => setManualCert(e.target.value)}
            placeholder="e.g. 12345678"
            onKeyDown={(e) => {
              if (e.key === "Enter") addManualCert();
            }}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </div>
        <button
          type="button"
          onClick={addManualCert}
          disabled={!manualCert.trim()}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded disabled:opacity-40"
        >
          Add cert
        </button>
      </div>

      {/* Scan log */}
      {scans.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Scans</h3>
          <ul className="text-xs space-y-1 text-gray-600">
            {scans.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <StatusDot status={s.status === "scanned" ? "ok" : s.status === "failed" ? "err" : "pending"} />
                <span className="font-mono truncate max-w-md">{s.file.name}</span>
                <span className="text-gray-400">
                  {s.status === "scanning" && "scanning…"}
                  {s.status === "scanned" && `→ ${s.detectedCount ?? 0} cert(s)`}
                  {s.status === "failed" && `failed: ${s.error}`}
                </span>
                {s.warning && (
                  <span className="text-amber-600">⚠ {s.warning}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cert entries */}
      {entries.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold">
                Detected certs ({entries.length})
              </h3>
              <p className="text-xs text-gray-500">
                Ready: {stats.ready} · Looking up: {stats.looking_up} ·
                Duplicate: {stats.duplicate} · Lookup failed: {stats.lookup_failed} ·
                Created: {stats.created} · Failed: {stats.create_failed}
              </p>
            </div>
            <button
              type="button"
              disabled={readyEntries.length === 0 || createMu.isPending}
              onClick={() => createMu.mutate()}
              className="px-4 py-2 bg-black text-white text-sm font-medium rounded disabled:opacity-40"
            >
              {createMu.isPending
                ? "Creating…"
                : `Create ${readyEntries.length} listing${readyEntries.length === 1 ? "" : "s"}`}
            </button>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 w-16"></th>
                  <th className="text-left px-3 py-2">Cert #</th>
                  <th className="text-left px-3 py-2">Card</th>
                  <th className="text-left px-3 py-2">Grade</th>
                  <th className="text-left px-3 py-2">Pop</th>
                  <th className="text-right px-3 py-2">Price</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {entries.map((e) => (
                  <tr key={e.key}>
                    <td className="px-3 py-2">
                      {e.info?.front_image_url ? (
                        <img
                          src={e.info.front_image_url}
                          alt=""
                          className="w-10 h-14 object-contain rounded border border-gray-200"
                        />
                      ) : (
                        <div className="w-10 h-14 bg-gray-100 rounded" />
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">{e.certNumber}</td>
                    <td className="px-3 py-2">
                      {e.info ? (
                        <div>
                          <div className="font-medium truncate max-w-[260px]">
                            {[e.info.year, e.info.brand, e.info.subject]
                              .filter(Boolean)
                              .join(" ")}
                          </div>
                          <div className="text-xs text-gray-500">
                            {e.info.card_number && `#${e.info.card_number}`}
                            {e.info.variety && ` · ${e.info.variety}`}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {e.info?.grade_label ?? (e.info ? e.info.grade : "—")}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {e.info?.population_equal != null && (
                        <>
                          {e.info.population_equal} @ {e.info.grade}
                          <br />
                          {e.info.population_higher ?? 0} higher
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={e.priceCents / 100}
                        onChange={(ev) =>
                          updateEntry(e.key, {
                            priceCents: Math.round(
                              parseFloat(ev.target.value || "0") * 100,
                            ),
                          })
                        }
                        className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={e.status} message={e.errorMessage} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeEntry(e.key)}
                        className="text-xs text-gray-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {batchResults && (
            <div className="mt-3 text-xs text-gray-500">
              Last batch:{" "}
              {batchResults.filter((r) => r.status === "created").length} created,{" "}
              {batchResults.filter((r) => r.status === "skipped_duplicate").length} duplicate,{" "}
              {batchResults.filter((r) => r.status === "failed").length} failed
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// runLookup is fire-and-forget. It mutates entries via the upsert callback
// rather than via React state directly, since it lives outside the render.
async function runLookup(
  entry: CertEntry,
  upsert: (next: CertEntry) => void,
): Promise<void> {
  try {
    const resp: LookupResponse = await lookupCert(entry.certNumber, {
      company: entry.company,
    });
    if (resp.already_listed) {
      upsert({
        ...entry,
        status: "duplicate",
        existingListingId: resp.listing_id,
        errorMessage: "Already in inventory",
        info: resp,
      });
    } else {
      upsert({ ...entry, status: "ready", info: resp });
    }
  } catch (err) {
    upsert({
      ...entry,
      status: "lookup_failed",
      errorMessage: (err as Error).message,
    });
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ status, message }: { status: CertStatus; message?: string }) {
  const cfg: Record<CertStatus, { label: string; className: string }> = {
    pending:        { label: "Pending",      className: "bg-gray-100 text-gray-700" },
    looking_up:     { label: "Looking up…",  className: "bg-blue-50 text-blue-700" },
    ready:          { label: "Ready",        className: "bg-green-50 text-green-700" },
    duplicate:      { label: "Duplicate",    className: "bg-amber-50 text-amber-700" },
    lookup_failed:  { label: "Lookup failed",className: "bg-red-50 text-red-700" },
    creating:       { label: "Creating…",    className: "bg-blue-50 text-blue-700" },
    created:        { label: "Created",      className: "bg-green-100 text-green-900" },
    create_failed:  { label: "Failed",       className: "bg-red-50 text-red-700" },
  };
  const c = cfg[status];
  return (
    <div>
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${c.className}`}>
        {c.label}
      </span>
      {message && status !== "ready" && status !== "created" && (
        <div className="text-xs text-gray-500 mt-0.5 max-w-[200px] truncate" title={message}>
          {message}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: "ok" | "err" | "pending" }) {
  const color =
    status === "ok" ? "bg-green-500" : status === "err" ? "bg-red-500" : "bg-gray-300";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

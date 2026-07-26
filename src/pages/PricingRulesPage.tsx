import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRule,
  deleteRule,
  listRules,
  updateRule,
  type PricingRule,
  type PricingRuleInput,
  type PricingSource,
} from "@/api/pricing";
import type { Game } from "@/api/catalog";
import type { GradingCompany } from "@/api/graded";

export function PricingRulesPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["pricing-rules"],
    queryFn: listRules,
  });
  const [showForm, setShowForm] = useState(false);

  const createMu = useMutation({
    mutationFn: createRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing-rules"] });
      setShowForm(false);
    },
  });
  const deleteMu = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing-rules"] }),
  });
  const toggleMu = useMutation({
    mutationFn: (vars: { id: string; active: boolean }) =>
      updateRule(vars.id, { active: vars.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing-rules"] }),
  });

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pricing rules</h1>
          <p className="text-sm text-gray-500 mt-1">
            Rules pick a source price (PSA market, TCGplayer mid, manual) and
            apply a floor + markup. Highest priority matching rule wins.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-black text-white text-sm font-medium rounded"
        >
          + Add rule
        </button>
      </div>

      {showForm && (
        <RuleForm
          onCancel={() => setShowForm(false)}
          onSubmit={(body) => createMu.mutate(body)}
          submitting={createMu.isPending}
          error={createMu.error ? (createMu.error as Error).message : undefined}
        />
      )}

      {q.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {q.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {(q.error as Error).message}
        </div>
      )}

      {q.isSuccess && q.data.items.length === 0 && !showForm && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-10 text-center text-gray-500">
          No pricing rules yet. Add one to start auto-pricing graded slabs.
        </div>
      )}

      {q.isSuccess && q.data.items.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="text-left px-3 py-2">Priority</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Selectors</th>
                <th className="text-left px-3 py-2">Source</th>
                <th className="text-left px-3 py-2">Floor</th>
                <th className="text-left px-3 py-2">Markup</th>
                <th className="text-left px-3 py-2">Active</th>
                <th className="text-right px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {q.data.items.map((r) => (
                <RuleRow
                  key={r.id}
                  rule={r}
                  onToggle={(active) => toggleMu.mutate({ id: r.id, active })}
                  onDelete={() => {
                    if (confirm(`Delete rule "${r.name}"?`)) deleteMu.mutate(r.id);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RuleRow({
  rule,
  onToggle,
  onDelete,
}: {
  rule: PricingRule;
  onToggle: (active: boolean) => void;
  onDelete: () => void;
}) {
  const sel: string[] = [];
  if (rule.listing_type) sel.push(`type=${rule.listing_type}`);
  if (rule.game) sel.push(`game=${rule.game}`);
  if (rule.grading_company) sel.push(`grader=${rule.grading_company}`);
  if (rule.grade_min != null) sel.push(`grade≥${rule.grade_min}`);
  if (rule.grade_max != null) sel.push(`grade≤${rule.grade_max}`);
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-2 font-mono text-xs">{rule.priority}</td>
      <td className="px-3 py-2 font-medium">
        {rule.name}
        {rule.description && (
          <div className="text-xs text-gray-500">{rule.description}</div>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-gray-600">
        {sel.length === 0 ? <span className="text-gray-400">any</span> : sel.join(" · ")}
      </td>
      <td className="px-3 py-2 text-xs">{rule.source}</td>
      <td className="px-3 py-2 font-mono text-xs">
        {rule.floor_cents != null ? `$${(rule.floor_cents / 100).toFixed(2)}` : "—"}
      </td>
      <td className="px-3 py-2 font-mono text-xs">
        {rule.markup_pct != null ? `${rule.markup_pct}%` : "—"}
      </td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={rule.active}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-gray-400 hover:text-red-600"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

function RuleForm({
  onCancel,
  onSubmit,
  submitting,
  error,
}: {
  onCancel: () => void;
  onSubmit: (body: PricingRuleInput) => void;
  submitting: boolean;
  error?: string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [listingType, setListingType] = useState<"" | "single" | "sealed" | "graded">("graded");
  const [game, setGame] = useState<"" | Game>("");
  const [company, setCompany] = useState<"" | GradingCompany>("psa");
  const [gradeMin, setGradeMin] = useState<string>("10");
  const [gradeMax, setGradeMax] = useState<string>("");
  const [floorDollars, setFloorDollars] = useState<string>("");
  const [markupPct, setMarkupPct] = useState<string>("5");
  const [source, setSource] = useState<PricingSource>("psa_market");
  const [priority, setPriority] = useState<number>(100);

  function submit() {
    onSubmit({
      name,
      description: description || null,
      listing_type: (listingType || null) as PricingRuleInput["listing_type"],
      game: (game || null) as PricingRuleInput["game"],
      grading_company: (company || null) as PricingRuleInput["grading_company"],
      grade_min: gradeMin ? parseFloat(gradeMin) : null,
      grade_max: gradeMax ? parseFloat(gradeMax) : null,
      floor_cents: floorDollars ? Math.round(parseFloat(floorDollars) * 100) : null,
      markup_pct: markupPct ? parseFloat(markupPct) : null,
      source,
      priority,
      active: true,
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mb-6 border border-gray-200 rounded-lg bg-white p-5"
    >
      <h2 className="font-semibold mb-4">New pricing rule</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label="Name *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="PSA 10 floor $50 + 5%"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
        <Field label="Priority (higher wins)">
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value || "0"))}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
        <Field label="Source">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as PricingSource)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            <option value="psa_market">PSA market</option>
            <option value="tcgplayer_mid">TCGplayer mid</option>
            <option value="manual">Manual (entered per item)</option>
          </select>
        </Field>

        <Field label="Listing type">
          <select
            value={listingType}
            onChange={(e) => setListingType(e.target.value as "" | "single" | "sealed" | "graded")}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            <option value="">any</option>
            <option value="single">single</option>
            <option value="sealed">sealed</option>
            <option value="graded">graded</option>
          </select>
        </Field>
        <Field label="Game">
          <select
            value={game}
            onChange={(e) => setGame(e.target.value as "" | Game)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            <option value="">any</option>
            <option value="pokemon">pokemon</option>
            <option value="magic">magic</option>
            <option value="weiss">weiss</option>
          </select>
        </Field>
        <Field label="Grader">
          <select
            value={company}
            onChange={(e) => setCompany(e.target.value as "" | GradingCompany)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          >
            <option value="">any</option>
            <option value="psa">PSA</option>
            <option value="bgs">BGS</option>
            <option value="sgc">SGC</option>
            <option value="cgc">CGC</option>
          </select>
        </Field>

        <Field label="Grade ≥">
          <input
            type="number"
            min={0}
            max={10}
            step="0.5"
            value={gradeMin}
            onChange={(e) => setGradeMin(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
        <Field label="Grade ≤">
          <input
            type="number"
            min={0}
            max={10}
            step="0.5"
            value={gradeMax}
            onChange={(e) => setGradeMax(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
        <div />

        <Field label="Floor ($)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={floorDollars}
            onChange={(e) => setFloorDollars(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
        <Field label="Markup (%)">
          <input
            type="number"
            step="0.1"
            value={markupPct}
            onChange={(e) => setMarkupPct(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
        <Field label="Description">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded"
          />
        </Field>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || !name}
          className="px-4 py-2 bg-black text-white text-sm rounded disabled:opacity-40"
        >
          {submitting ? "Creating…" : "Create rule"}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

import { fetchAPI } from "./client";
import type { Game } from "./catalog";
import type { GradingCompany } from "./graded";

export type PricingSource = "manual" | "psa_market" | "tcgplayer_mid";

export interface PricingRule {
  id: string;
  name: string;
  description?: string | null;
  listing_type?: "single" | "sealed" | "graded" | null;
  game?: Game | null;
  grading_company?: GradingCompany | null;
  grade_min?: number | null;
  grade_max?: number | null;
  floor_cents?: number | null;
  markup_pct?: number | null;
  source: PricingSource;
  priority: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type PricingRuleInput = Omit<
  PricingRule,
  "id" | "created_at" | "updated_at"
>;

export async function listRules(): Promise<{ items: PricingRule[] }> {
  return fetchAPI("/api/v1/admin/pricing/rules");
}

export async function createRule(body: PricingRuleInput): Promise<PricingRule> {
  return fetchAPI("/api/v1/admin/pricing/rules", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateRule(id: string, body: Partial<PricingRuleInput>): Promise<PricingRule> {
  return fetchAPI(`/api/v1/admin/pricing/rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteRule(id: string): Promise<void> {
  return fetchAPI(`/api/v1/admin/pricing/rules/${id}`, { method: "DELETE" });
}

export interface ApplyRequestItem {
  key: string;
  listing_type: "single" | "sealed" | "graded";
  game: Game;
  grading_company?: GradingCompany;
  grade?: number;
  source_cents: number;
}

export interface ApplyResultItem {
  key: string;
  rule_id?: string;
  rule_name?: string;
  source: string;
  source_cents: number;
  floor_cents?: number;
  markup_pct?: number;
  price_cents: number;
  reason?: string;
}

export async function applyRules(
  items: ApplyRequestItem[],
): Promise<{ results: ApplyResultItem[] }> {
  return fetchAPI("/api/v1/admin/pricing/apply", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

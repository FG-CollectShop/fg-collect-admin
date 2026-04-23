# fg-collect-admin

The private staff-only admin UI for `FG-CollectShop`. Day-to-day inventory operations live here: intake, bin assignment, pricing, pick/pack.

## Mission

Be the fastest way to move a physical card from *arrived at the house* to *listed and sellable across every channel* — and back out the door when it sells. Optimized for one operator working at a desk with a scanner and a label printer, not for a team.

## What this repo is

A UI that talks to the `fg-collect-core` API. No direct database access, no business logic that duplicates what core already enforces. Every write goes through an authenticated API endpoint so the same invariants apply whether the change came from admin, a worker, or a webhook.

Scope:

- Intake flow: barcode / set code + collector number → new inventory row
- Assign physical bin location, condition, language, foil, printing, grading
- Bulk operations: price sweeps, channel toggles, relisting
- Pick/pack flow for orders pulled in from any channel (ManaPool, TCGPlayer, storefront)
- Label printing and scanner integration for the home setup

## What this repo is *not*

- Not the inventory system itself. Data, schema, and business logic live in [`fg-collect-core`](https://github.com/FG-CollectShop/fg-collect-core).
- Not the storefront. Customer-facing UI lives in [`fg-collect-storefront`](https://github.com/FG-CollectShop/fg-collect-storefront) (public).
- Not infrastructure. Deployment, tunnels, and host config live in [`fg-collect-infra`](https://github.com/FG-CollectShop/fg-collect-infra).
- Not a public surface. Auth-gated, never exposed unauthenticated.

## How it fits in

```
  ┌──────────────────────────┐
  │  fg-collect-admin         │  ← this repo (private, auth-gated)
  │  staff UI                │
  └────────────┬─────────────┘
               │ authenticated API calls
               ▼
  ┌──────────────────────────┐
  │  fg-collect-core (API)   │  ← private
  │  inventory, orders, auth │
  └──────────────────────────┘
```

## Constraints

- **Private.** Contains staff workflows and references to internal conventions. Never make public.
- **No direct DB access.** All reads and writes go through the core API. If something can't be done via the API, add the endpoint to core — don't shortcut around it.
- **Pinned schema.** Builds against a specific version of `packages/schema` from `fg-collect-core` (published package or codegen). No hand-typed API contracts that can drift.
- **Auth-gated.** No anonymous access, ever. Session or token auth enforced by core.

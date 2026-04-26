export function OrdersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
      <p className="text-sm text-gray-500 mt-1 max-w-2xl">
        Incoming orders from every channel — storefront via Stripe, plus
        ManaPool and TCGPlayer once those integrations are wired. One unified
        pick/pack flow regardless of source.
      </p>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        {[
          {
            title: "Pending pick",
            blurb:
              "Newly-paid orders. Card thumbnail, bin location, quantity, condition. Scan-to-confirm flow.",
          },
          {
            title: "Ready to ship",
            blurb:
              "Picked + packed. Generate label, attach tracking, mark shipped — fires update back to the original channel.",
          },
          {
            title: "Refunds / disputes",
            blurb:
              "Stripe disputes, ManaPool/TCGPlayer adjustments. Surfaces the relevant order and history.",
          },
          {
            title: "Reconciliation",
            blurb:
              "Daily roll-up: orders × channels × Stripe payouts. Catches drift between counted shipments and recorded sales.",
          },
        ].map((card) => (
          <div
            key={card.title}
            className="rounded-lg border border-dashed border-gray-300 p-5 bg-white"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Coming soon
            </div>
            <div className="mt-1 text-sm font-semibold">{card.title}</div>
            <p className="mt-2 text-xs text-gray-600">{card.blurb}</p>
          </div>
        ))}
      </section>

      <p className="mt-8 text-xs text-gray-500 max-w-2xl">
        Wires up after the Stripe webhook handler in core actually persists
        orders (currently it logs the event but doesn't write the row).
      </p>
    </div>
  );
}

export function ListingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Listings</h1>
      <p className="text-sm text-gray-500 mt-1 max-w-2xl">
        Manage where each inventory item is actively for sale. One inventory
        item can be listed on multiple channels at different prices — this is
        where you toggle channels, run price sweeps, and pause/resume listings.
      </p>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Channel toggles",
            blurb:
              "Per-listing on/off for storefront, ManaPool, TCGPlayer. Cross-channel pricing (different fees, different floors) is rendered side-by-side.",
          },
          {
            title: "Bulk price sweep",
            blurb:
              "Pick a set + condition + foil filter, apply a percentage adjustment or floor/ceiling, preview the diff, commit.",
          },
          {
            title: "Stripe sync status",
            blurb:
              "Per-listing Stripe Product/Price IDs. Surfaces drift between local listing and Stripe state, with a 'resync' button.",
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
        Why this is empty: today the <code>listings</code> table doubles as
        inventory + for-sale state. Splitting <code>inventory_items</code> off
        is a follow-up migration; this page lights up after that.
      </p>
    </div>
  );
}

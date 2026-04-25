export function PlaceholderPage({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <div className="mt-8 rounded-lg border-2 border-dashed border-gray-200 p-10 text-center text-gray-500">
        <div className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Not built yet
        </div>
        <p className="mt-3 max-w-xl mx-auto">{blurb}</p>
      </div>
    </div>
  );
}

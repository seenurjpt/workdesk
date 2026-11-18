export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-8"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="bg-surface-soft mb-8 h-10 w-48 animate-pulse rounded-xl" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-surface-soft mb-3 h-12 animate-pulse rounded-xl" />
      ))}
    </div>
  );
}

// Placeholder shown while a lazily loaded screen's code downloads (next/dynamic `loading`); sized like a screen card so
// the page does not jump when the screen appears.
export function ScreenLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <span className="sr-only">Loading…</span>
      <div className="h-5 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-72 max-w-full animate-pulse rounded bg-muted" />
      <div className="grid gap-3 pt-2">
        <div className="h-9 animate-pulse rounded bg-muted" />
        <div className="h-9 animate-pulse rounded bg-muted" />
        <div className="h-9 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

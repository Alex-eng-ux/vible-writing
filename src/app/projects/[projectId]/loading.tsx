export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-sm text-ink-500">
      <div
        className="h-6 w-6 animate-spin rounded-full border-2 border-ink-200 border-t-ink-700"
        aria-hidden="true"
      />
      <span role="status" aria-live="polite">
        正在加载…
      </span>
    </div>
  );
}

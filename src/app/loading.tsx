export default function Loading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-ink-500">
      <div
        className="h-5 w-5 animate-spin rounded-full border-2 border-ink-200 border-t-ink-700"
        aria-hidden="true"
      />
      <span role="status" aria-live="polite">
        加载中…
      </span>
    </div>
  );
}

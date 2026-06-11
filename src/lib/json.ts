// Helpers to safely (de)serialize JSON columns in SQLite.

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

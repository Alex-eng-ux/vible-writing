// Provider registry. The SINGLE place that knows which ChatModel to construct
// for the current process.
//
// To add a new provider (Anthropic, Gemini, a local Ollama, …):
//   1. Create `src/lib/ai/providers/<name>.ts` exporting a class that
//      implements `ChatModel`.
//   2. Add ONE `if` branch below that constructs it from its env vars.
// That's it. service.ts, actions.ts, and the UI do not need to change.

import type { ChatModel, ChatModelInfo } from './types';
import { OpenAIChatModel } from './openai';

let cached: ChatModel | null | undefined;

/**
 * Returns the active ChatModel, or `null` when the process is in mock mode
 * (i.e. no provider is configured). The result is cached for the lifetime of
 * the module so the constructor runs at most once per process.
 */
export function getModel(): ChatModel | null {
  if (cached !== undefined) return cached;

  // OpenAI-compatible path. We treat any non-empty OPENAI_API_KEY as "the
  // user wants to talk to an OpenAI-shaped endpoint".
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    cached = null;
    return cached;
  }

  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  cached = new OpenAIChatModel({ apiKey, baseUrl, model, timeoutMs: 60_000 });
  return cached;
}

/**
 * Convenience for the home page / layout: surface the active model name (or a
 * mock-mode stub) without forcing callers to know the registry internals.
 */
export function getModelInfo(): ChatModelInfo {
  const m = getModel();
  if (m) return m.info();
  return { id: 'mock', provider: 'mock', displayName: 'Mock 模式' };
}

/** True when no real provider is configured. service.ts uses this to short-circuit. */
export function isMockMode(): boolean {
  return getModel() === null;
}

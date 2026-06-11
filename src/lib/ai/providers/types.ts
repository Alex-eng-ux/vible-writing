// ChatModel provider abstraction.
//
// The goal: a new AI backend (Anthropic, Gemini, local Ollama, …) should
// require adding exactly ONE file under ./providers/ and a single `if` branch
// in ./registry.ts. Nothing in ./service.ts, ./actions.ts, or any UI component
// should need to change.
//
// All providers MUST:
//   - implement `ChatModel.complete(messages, options)` and return the model's
//     text content as a string.
//   - throw `ChatModelError` on any HTTP / network / parse failure. The error's
//     `message` field is what the user may see; the `cause` is for server logs
//     only and may carry raw payloads, API keys, etc.

export type ChatMessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
}

export interface ChatModelInfo {
  /** Stable identifier, e.g. 'openai:gpt-4o-mini', 'anthropic:claude-3.5-sonnet'. */
  id: string;
  /** Provider name, e.g. 'openai' | 'anthropic' | 'mock'. */
  provider: string;
  /** Human-readable label for UI surfaces. */
  displayName: string;
}

export interface ChatCompletionOptions {
  /** When true, the provider SHOULD request a JSON response shape. */
  jsonMode?: boolean;
  /** Caller-supplied cancellation / timeout signal. */
  signal?: AbortSignal;
  /** Sampling temperature. Providers may clamp to their supported range. */
  temperature?: number;
  /** Maximum output tokens. Providers may clamp to their supported range. */
  maxTokens?: number;
}

export interface ChatModel {
  info(): ChatModelInfo;
  complete(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<string>;
}

/**
 * Error thrown by every provider. The `message` is the public-facing, sanitized
 * string (safe to surface to the user). The `cause` is the raw underlying
 * error — for server-side logs only; never send it to the client.
 */
export class ChatModelError extends Error {
  public readonly provider: string;
  public readonly cause?: unknown;

  constructor(message: string, provider: string, cause?: unknown) {
    super(message);
    this.name = 'ChatModelError';
    this.provider = provider;
    this.cause = cause;
  }
}

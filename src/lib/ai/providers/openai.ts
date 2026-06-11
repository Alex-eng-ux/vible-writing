// OpenAI-compatible ChatModel provider.
//
// Talks to any endpoint that follows the OpenAI /chat/completions shape, which
// in practice means: api.openai.com, Azure OpenAI, OpenRouter, vLLM, Ollama's
// OpenAI-compatible shim, etc. Just point `baseUrl` at it.
//
// Uses native `fetch` only — no `openai` SDK dependency.

import { ChatModelError, type ChatMessage, type ChatModel, type ChatCompletionOptions, type ChatModelInfo } from './types';

export interface OpenAIChatModelOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Per-request timeout. Defaults to 60_000ms. */
  timeoutMs?: number;
}

interface OpenAICompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Strip credentials / bearer tokens / API keys from any string we might echo
 * back to a user-facing log or error message. The raw error body and the
 * original cause are kept on `ChatModelError.cause` for server-side debugging.
 */
export function sanitizeErrorMessage(text: string): string {
  if (!text) return '';
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/g, 'Bearer ***')
    .replace(/\bsk-[A-Za-z0-9_\-]{16,}\b/g, 'sk-***')
    .replace(/\bsk-proj-[A-Za-z0-9_\-]{16,}\b/g, 'sk-proj-***')
    .replace(/(https?:\/\/[^@\s]+:)[^@\s]+@/g, '$1***@')
    .slice(0, 200);
}

const SYSTEM_FALLBACK =
  'You are a careful fiction editor / author. Always return strict JSON that matches the requested shape. No prose outside JSON.';

export class OpenAIChatModel implements ChatModel {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly info: ChatModelInfo;

  constructor(options: OpenAIChatModelOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.info = {
      id: `openai:${this.model}`,
      provider: 'openai',
      displayName: this.model,
    };
  }

  info(): ChatModelInfo {
    return this.info;
  }

  async complete(messages: ChatMessage[], options: ChatCompletionOptions = {}): Promise<string> {
    // Validate the base URL once: must be a parseable https:// URL, with a
    // localhost exception for local proxies / Ollama / vLLM.
    try {
      const u = new URL(this.baseUrl);
      if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
        throw new ChatModelError('AI 服务配置错误', 'openai');
      }
    } catch (e) {
      if (e instanceof ChatModelError) throw e;
      throw new ChatModelError('AI 服务配置错误', 'openai', e);
    }

    // Make sure there is at least one system message: the legacy service
    // always sent a system preamble requesting strict JSON. Preserve that
    // behavior so prompts in prompts.ts don't need to be changed.
    const finalMessages: ChatMessage[] = messages.some((m) => m.role === 'system')
      ? messages
      : [{ role: 'system', content: SYSTEM_FALLBACK }, ...messages];

    const body: Record<string, unknown> = {
      model: this.model,
      temperature: options.temperature ?? 0.8,
      messages: finalMessages,
    };
    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    if (typeof options.maxTokens === 'number') {
      body.max_tokens = options.maxTokens;
    }

    // Compose the final abort signal: caller's signal (if any) OR a timeout.
    // We use AbortSignal.timeout so we get a real DOMException on the wire.
    const signal = options.signal ?? AbortSignal.timeout(this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      // Network / timeout / DNS — never leak internals to the client.
      console.warn('[ai] LLM request failed:', sanitizeErrorMessage((err as Error)?.message || ''));
      throw new ChatModelError('AI 服务暂时不可用', 'openai', err);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[ai] LLM ${res.status}: ${sanitizeErrorMessage(text)}`);
      throw new ChatModelError('AI 服务暂时不可用', 'openai', { status: res.status, body: text });
    }

    let data: OpenAICompletionResponse;
    try {
      data = (await res.json()) as OpenAICompletionResponse;
    } catch (err) {
      throw new ChatModelError('AI 返回为空', 'openai', err);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new ChatModelError('AI 返回为空', 'openai', data);
    return content;
  }
}

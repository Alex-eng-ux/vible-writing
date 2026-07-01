import type { ChatModel, ChatModelInfo } from './types';
import { OpenAIChatModel } from './openai';
import { getResolvedAIConfig } from '@/lib/ai/config';

let cached: ChatModel | null | undefined;
let cachedKey = '';

export async function getModel(): Promise<ChatModel | null> {
  const config = await getResolvedAIConfig();
  const nextKey = config ? `${config.baseUrl}|${config.model}|${config.apiKey}` : 'mock';

  if (cached !== undefined && cachedKey === nextKey) return cached;

  if (!config?.apiKey) {
    cached = null;
    cachedKey = nextKey;
    return cached;
  }

  cached = new OpenAIChatModel({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: 60_000,
  });
  cachedKey = nextKey;
  return cached;
}

export async function getModelInfo(): Promise<ChatModelInfo> {
  const m = await getModel();
  if (m) return m.info();
  return { id: 'mock', provider: 'mock', displayName: 'Mock 模式' };
}

export async function isMockMode(): Promise<boolean> {
  return (await getModel()) === null;
}

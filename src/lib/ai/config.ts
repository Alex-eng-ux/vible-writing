import { promises as fs } from 'fs';
import path from 'path';
import { UserError } from '@/lib/errors';

export type AIProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  updatedAt: string;
};

export type AISettingsSummary = {
  connected: boolean;
  provider: string;
  displayName: string;
  baseUrl: string;
  model: string;
  updatedAt: string;
  apiKeyMasked: string;
  source: 'none' | 'env' | 'local';
};

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_MODEL = 'gpt-4o-mini';

const CONFIG_DIR = path.join(process.cwd(), '.vible');
const CONFIG_PATH = path.join(CONFIG_DIR, 'ai-config.json');
const ENV_PATH = path.join(process.cwd(), '.env');

export function maskApiKey(apiKey: string): string {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return '*'.repeat(apiKey.length);
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

export function normalizeAIConfig(input: {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}) {
  const apiKey = input.apiKey.trim();
  const baseUrl = (input.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  const model = (input.model || DEFAULT_MODEL).trim();

  if (!apiKey) {
    throw new UserError('请输入 API Key。', 'validation_failed');
  }
  if (!model) {
    throw new UserError('请输入模型名称。', 'validation_failed');
  }
  try {
    const url = new URL(baseUrl);
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !isLocal) {
      throw new UserError('Base URL 必须是 https 地址，除非你连接的是本地服务。', 'validation_failed');
    }
  } catch (err) {
    if (err instanceof UserError) throw err;
    throw new UserError('Base URL 格式不正确。', 'validation_failed');
  }

  return {
    apiKey,
    baseUrl,
    model,
    updatedAt: new Date().toISOString(),
  } satisfies AIProviderConfig;
}

async function ensureDir() {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

async function readLocalConfig(): Promise<AIProviderConfig | null> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AIProviderConfig>;
    if (!parsed.apiKey) return null;
    return {
      apiKey: String(parsed.apiKey).trim(),
      baseUrl: String(parsed.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, ''),
      model: String(parsed.model || DEFAULT_MODEL).trim(),
      updatedAt: String(parsed.updatedAt || ''),
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    throw err;
  }
}

async function writeEnvMirror(config: AIProviderConfig | null) {
  let existing = '';
  try {
    existing = await fs.readFile(ENV_PATH, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }

  const lines = existing
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(
      (line) =>
        !line.startsWith('OPENAI_API_KEY=') &&
        !line.startsWith('OPENAI_BASE_URL=') &&
        !line.startsWith('OPENAI_MODEL=')
    );

  if (config) {
    lines.push(`OPENAI_API_KEY=${config.apiKey}`);
    lines.push(`OPENAI_BASE_URL=${config.baseUrl}`);
    lines.push(`OPENAI_MODEL=${config.model}`);
  }

  await fs.writeFile(ENV_PATH, `${lines.join('\n')}\n`, 'utf8');
}

function applyProcessEnv(config: AIProviderConfig | null) {
  if (config) {
    process.env.OPENAI_API_KEY = config.apiKey;
    process.env.OPENAI_BASE_URL = config.baseUrl;
    process.env.OPENAI_MODEL = config.model;
    return;
  }
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_MODEL;
}

export async function saveServerAIConfig(input: {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}) {
  const config = normalizeAIConfig(input);
  await ensureDir();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  await writeEnvMirror(config);
  applyProcessEnv(config);
  return config;
}

export async function clearServerAIConfig() {
  try {
    await fs.unlink(CONFIG_PATH);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }
  await writeEnvMirror(null);
  applyProcessEnv(null);
}

export async function getResolvedAIConfig(): Promise<AIProviderConfig | null> {
  const local = await readLocalConfig();
  if (local) {
    applyProcessEnv(local);
    return local;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, ''),
    model: (process.env.OPENAI_MODEL || DEFAULT_MODEL).trim(),
    updatedAt: 'env',
  };
}

export async function getAIConfigSummary(): Promise<AISettingsSummary> {
  const local = await readLocalConfig();
  const config = local ?? (await getResolvedAIConfig());
  if (!config) {
    return {
      connected: false,
      provider: 'mock',
      displayName: 'Mock 模式',
      baseUrl: '',
      model: '',
      updatedAt: '',
      apiKeyMasked: '',
      source: 'none',
    };
  }

  return {
    connected: true,
    provider: 'openai',
    displayName: `OpenAI Compatible · ${config.model}`,
    baseUrl: config.baseUrl,
    model: config.model,
    updatedAt: config.updatedAt,
    apiKeyMasked: maskApiKey(config.apiKey),
    source: local ? 'local' : 'env',
  };
}

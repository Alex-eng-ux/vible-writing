'use client';

import { useState, useTransition } from 'react';
import {
  clearAISettingsAction,
  saveAISettingsAction,
} from '@/app/actions';
import { Field, Section } from '@/components/ui';
import { formatUserFacingError } from '@/lib/errors';
import type { AISettingsSummary } from '@/lib/ai/config';

export default function AISettingsForm({
  initial,
}: {
  initial: AISettingsSummary;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<AISettingsSummary>(initial);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl || 'https://api.openai.com/v1');
  const [model, setModel] = useState(initial.model || 'gpt-4o-mini');

  const sourceLabel =
    summary.source === 'local'
      ? '服务端本地配置'
      : summary.source === 'env'
      ? '.env 环境变量'
      : '未配置';

  function handleSave() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set('apiKey', apiKey);
        form.set('baseUrl', baseUrl);
        form.set('model', model);
        const result = await saveAISettingsAction(form);
        setSummary({
          connected: true,
          provider: 'openai',
          displayName: `OpenAI Compatible · ${result.config.model}`,
          baseUrl: result.config.baseUrl,
          model: result.config.model,
          updatedAt: result.config.updatedAt,
          apiKeyMasked: `${result.config.apiKey.slice(0, 4)}...${result.config.apiKey.slice(-4)}`,
          source: 'local',
        });
        setApiKey('');
        setNotice('AI 配置已保存到服务端，刷新页面后即可使用真实模型。');
      } catch (err) {
        setError(formatUserFacingError(err));
      }
    });
  }

  function handleClear() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await clearAISettingsAction();
        setSummary({
          connected: false,
          provider: 'mock',
          displayName: 'Mock 模式',
          baseUrl: '',
          model: '',
          updatedAt: '',
          apiKeyMasked: '',
          source: 'none',
        });
        setApiKey('');
        setBaseUrl('https://api.openai.com/v1');
        setModel('gpt-4o-mini');
        setNotice('服务端 AI 配置已清除，系统会回退到 Mock 模式。');
      } catch (err) {
        setError(formatUserFacingError(err));
      }
    });
  }

  return (
    <div className="space-y-4">
      <Section title="连接状态" description="这里展示当前服务端会优先使用哪一路 AI 配置。">
        <div className="grid grid-cols-1 gap-3 text-sm text-ink-700 md:grid-cols-2">
          <div className="rounded-md bg-ink-50 px-3 py-2">
            <div className="label">当前状态</div>
            <div className="mt-1">{summary.connected ? summary.displayName : 'Mock 模式'}</div>
          </div>
          <div className="rounded-md bg-ink-50 px-3 py-2">
            <div className="label">配置来源</div>
            <div className="mt-1">{sourceLabel}</div>
          </div>
          <div className="rounded-md bg-ink-50 px-3 py-2">
            <div className="label">Base URL</div>
            <div className="mt-1 break-all">{summary.baseUrl || '未配置'}</div>
          </div>
          <div className="rounded-md bg-ink-50 px-3 py-2">
            <div className="label">模型</div>
            <div className="mt-1">{summary.model || '未配置'}</div>
          </div>
          <div className="rounded-md bg-ink-50 px-3 py-2 md:col-span-2">
            <div className="label">Key 摘要</div>
            <div className="mt-1">{summary.apiKeyMasked || '未配置'}</div>
          </div>
        </div>
      </Section>

      <Section
        title="配置 API"
        description="这里的设置会保存到服务器本地，后续所有 AI 生成、润色、抽取和一致性检查都会使用这份配置。"
      >
        <div className="space-y-4">
          <Field label="API Key" hint="会保存到服务端配置文件，并同步到运行环境。">
            <input
              className="input"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={summary.apiKeyMasked || '输入新的 API Key'}
            />
          </Field>

          <Field label="Base URL" hint="默认是 OpenAI 官方地址，也可以填写兼容 OpenAI 协议的网关。">
            <input
              className="input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </Field>

          <Field label="模型" hint="例如 gpt-4o-mini，或你网关支持的兼容模型名。">
            <input
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
            />
          </Field>

          {error ? <div className="text-sm text-danger">{error}</div> : null}
          {notice ? <div className="text-sm text-ok">{notice}</div> : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={pending} onClick={handleSave}>
              {pending ? '保存中…' : '保存到服务端'}
            </button>
            <button type="button" className="btn" disabled={pending} onClick={handleClear}>
              清除服务端配置
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}

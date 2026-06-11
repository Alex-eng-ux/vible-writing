'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adoptBriefAction, optimizePromptAction } from '@/app/actions';
import { formatUserFacingError } from '@/lib/errors';
import { Section, Field, StatusBadge } from '@/components/ui';
import type { CreativeBrief } from '@/types/domain';

export default function PromptOptimizer({
  projectId,
  initialBrief,
  rawIdea,
}: {
  projectId: string;
  initialBrief: CreativeBrief | null;
  rawIdea: string;
}) {
  const router = useRouter();
  const [brief, setBrief] = useState<CreativeBrief | null>(initialBrief);
  const [mock, setMock] = useState(false);
  const [pending, startTransition] = useTransition();
  const [adopting, setAdopting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await optimizePromptAction(projectId);
        setBrief(result.brief);
        setMock(!!result.mock);
      } catch (err) {
        setError(formatUserFacingError(err));
      }
    });
  }

  function adopt() {
    if (!brief) return;
    setAdopting(true);
    setError(null);
    startTransition(async () => {
      try {
        await adoptBriefAction(projectId, brief);
        router.push(`/projects/${projectId}/outline`);
      } catch (err) {
        setError(formatUserFacingError(err));
        setAdopting(false);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Section
        title="原始创意"
        description="这是你在创建作品时输入的内容。点击「优化提示词」让 AI 把它扩展为结构化 brief。"
        right={
          brief ? <StatusBadge status="generated" /> : <StatusBadge status="pending" />
        }
      >
        <div className="textarea min-h-[180px] whitespace-pre-wrap bg-ink-50 text-ink-800">
          {rawIdea}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button className="btn-primary" disabled={pending} onClick={run}>
            {pending ? '优化中…' : brief ? '重新优化提示词' : '优化提示词'}
          </button>
          {brief ? (
            <button
              className="btn"
              disabled={adopting || pending}
              onClick={adopt}
              title="采用本结果作为作品基础设定，并自动生成 Story Bible 初始条目"
            >
              {adopting ? '写入中…' : '采用此结果，进入大纲'}
            </button>
          ) : null}
        </div>
        {error ? <div className="mt-3 text-xs text-danger">{error}</div> : null}
      </Section>

      <Section
        title="优化结果"
        description={mock ? '当前结果来自占位数据（未配置 OPENAI_API_KEY）' : 'AI 生成的结构化 brief'}
        right={mock ? <span className="chip chip-warn">占位数据</span> : null}
      >
        {brief ? (
          <BriefView brief={brief} />
        ) : (
          <div className="text-sm text-ink-500">点击「优化提示词」开始。</div>
        )}
      </Section>
    </div>
  );
}

function BriefView({ brief }: { brief: CreativeBrief }) {
  return (
    <div className="space-y-4">
      <Section
        title="创意完整度评分"
        description="AI 对原始创意信息密度的评估。"
      >
        <ScoreBar value={brief.completenessScore} />
      </Section>

      <Section title="优化后的创作 brief" description="可直接作为系统后续生成的输入。">
        <p className="prose-novel text-ink-800">{brief.refinedIdea}</p>
      </Section>

      <Section title="结构化要素">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="题材"><div className="text-sm">{brief.genre}</div></Field>
          <Field label="基调"><div className="text-sm">{brief.tone}</div></Field>
          <Field label="目标读者"><div className="text-sm">{brief.targetAudience}</div></Field>
          <Field label="主角">
            <div className="text-sm">
              <span className="font-medium">{brief.protagonist.name || '未命名'}</span>
              <span className="text-ink-500"> · {brief.protagonist.summary}</span>
            </div>
          </Field>
          <Field label="核心冲突" className="sm:col-span-2"><div className="text-sm">{brief.coreConflict}</div></Field>
          <Field label="世界观方向" className="sm:col-span-2"><div className="text-sm">{brief.worldDirection}</div></Field>
        </div>
      </Section>

      <Section title="写作约束">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-800">
          {brief.writingConstraints.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </Section>

      <Section title="缺失信息" description="如果补齐这些信息，AI 生成结果会显著提升。">
        {brief.missingInfo.length === 0 ? (
          <div className="text-sm text-ink-500">无明显缺失。</div>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-800">
            {brief.missingInfo.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="三个可选创作方向">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-800">
          {brief.directions.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ol>
      </Section>

      <Section title="后续追问问题">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-800">
          {brief.followUpQuestions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function ScoreBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const color = v < 40 ? 'bg-warn' : v < 70 ? 'bg-ink-600' : 'bg-ok';
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-3xl font-semibold text-ink-900">{v}</span>
        <span className="text-sm text-ink-500">/ 100</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full ${color}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

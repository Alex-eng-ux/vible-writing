'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  checkConsistencyAction,
  dismissIssueAction,
  generateFixSuggestionAction,
  markIssueResolvedAction,
} from '@/app/actions';
import { formatUserFacingError } from '@/lib/errors';
import { Section, SeverityBadge, StatusBadge } from '@/components/ui';
import type { ChapterOutline, ConsistencyIssue, FixSuggestion } from '@/types/domain';

type ChapterRow = {
  id: string;
  chapterNumber: number;
  title: string;
  outline: ChapterOutline | null;
  content: string;
  summary: string;
  status: string;
};

type ReportRow = {
  id: string;
  projectId: string;
  chapterId: string;
  createdAt: Date | string;
  issues: ConsistencyIssue[];
  status: string;
  mock?: boolean;
  chapter?: { id: string; title: string; chapterNumber: number };
};

// Defensive shape normalization. The DB column is a JSON string; if a record
// is missing fields (older shape, bad LLM output, manual edit) we still want
// the page to render without throwing.
function normalizeIssue(raw: Partial<ConsistencyIssue> | null | undefined): ConsistencyIssue {
  const allowedSeverities = ['critical', 'warning', 'info'] as const;
  const allowedStatus = ['open', 'resolved', 'dismissed'] as const;
  const sev =
    raw?.severity && (allowedSeverities as readonly string[]).includes(raw.severity)
      ? (raw.severity as ConsistencyIssue['severity'])
      : 'info';
  const st =
    raw?.status && (allowedStatus as readonly string[]).includes(raw.status)
      ? (raw.status as ConsistencyIssue['status'])
      : 'open';
  return {
    severity: sev,
    type: (raw?.type as ConsistencyIssue['type']) || 'style_or_constraint_violation',
    message: raw?.message || '（未提供问题描述）',
    evidence: Array.isArray(raw?.evidence) ? raw!.evidence : [],
    suggestions: Array.isArray(raw?.suggestions) ? raw!.suggestions : [],
    status: st,
  };
}

function normalizeIssues(raw: unknown): ConsistencyIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((i) => normalizeIssue(i as Partial<ConsistencyIssue>));
}

export default function ConsistencyView({
  projectId,
  chapters,
  reports,
}: {
  projectId: string;
  chapters: ChapterRow[];
  reports: ReportRow[];
}) {
  const [chapterId, setChapterId] = useState<string | null>(chapters[0]?.id || null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fixes, setFixes] = useState<Record<string, FixSuggestion>>({});
  const [loadingFix, setLoadingFix] = useState<Record<string, boolean>>({});
  const [localReports, setLocalReports] = useState<ReportRow[]>(() =>
    reports.map((r) => ({ ...r, issues: normalizeIssues(r.issues) }))
  );
  const [busy, setBusy] = useState<{
    run?: boolean;
    issueKey?: string;
  }>({});
  const [mocked, setMocked] = useState(false);

  function runCheck() {
    if (!chapterId) return;
    setError(null);
    setBusy((b) => ({ ...b, run: true }));
    startTransition(async () => {
      try {
        const { id, createdAt, issues, mock } = await checkConsistencyAction(chapterId);
        const ch = chapters.find((c) => c.id === chapterId);
        const newRow: ReportRow = {
          id,
          projectId,
          chapterId,
          // Use the canonical server time, not a client-generated one.
          createdAt: createdAt ?? new Date().toISOString(),
          issues: normalizeIssues(issues),
          status: 'open',
          mock: !!mock,
          chapter: ch ? { id: ch.id, title: ch.title, chapterNumber: ch.chapterNumber } : undefined,
        };
        setLocalReports((list) => [newRow, ...list]);
        setMocked(!!mock);
      } catch (err) {
        setError(formatUserFacingError(err));
      } finally {
        setBusy((b) => ({ ...b, run: false }));
      }
    });
  }

  function getFix(reportId: string, issueIndex: number) {
    const key = `${reportId}:${issueIndex}`;
    if (loadingFix[key]) return;
    setLoadingFix((m) => ({ ...m, [key]: true }));
    setError(null);
    startTransition(async () => {
      try {
        const { suggestion, mock } = await generateFixSuggestionAction(reportId, issueIndex);
        setFixes((m) => ({ ...m, [key]: suggestion }));
        if (mock) setMocked(true);
      } catch (err) {
        setError(formatUserFacingError(err));
      } finally {
        setLoadingFix((m) => ({ ...m, [key]: false }));
      }
    });
  }

  function applyLocalUpdate(
    reportId: string,
    issueIndex: number,
    status: 'open' | 'resolved' | 'dismissed'
  ) {
    setLocalReports((list) =>
      list.map((r) => {
        if (r.id !== reportId) return r;
        const issues = r.issues.map((i, idx) =>
          idx === issueIndex ? normalizeIssue({ ...i, status }) : i
        );
        return { ...r, issues };
      })
    );
  }

  function resolve(reportId: string, issueIndex: number) {
    const key = `${reportId}:${issueIndex}`;
    applyLocalUpdate(reportId, issueIndex, 'resolved');
    setBusy((b) => ({ ...b, issueKey: key }));
    startTransition(async () => {
      try {
        await markIssueResolvedAction(reportId, issueIndex);
      } catch (err) {
        // Roll back optimistic update so the user can retry.
        applyLocalUpdate(reportId, issueIndex, 'open');
        setError(formatUserFacingError(err));
      } finally {
        setBusy((b) => ({ ...b, issueKey: undefined }));
      }
    });
  }
  function dismiss(reportId: string, issueIndex: number) {
    const key = `${reportId}:${issueIndex}`;
    applyLocalUpdate(reportId, issueIndex, 'dismissed');
    setBusy((b) => ({ ...b, issueKey: key }));
    startTransition(async () => {
      try {
        await dismissIssueAction(reportId, issueIndex);
      } catch (err) {
        applyLocalUpdate(reportId, issueIndex, 'open');
        setError(formatUserFacingError(err));
      } finally {
        setBusy((b) => ({ ...b, issueKey: undefined }));
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-3">
        <div className="card p-3">
          <div className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-ink-500">
            选择章节
          </div>
          <ul className="space-y-1">
            {chapters.length === 0 ? (
              <li className="px-2 py-2 text-sm text-ink-500">还没有章节。</li>
            ) : (
              chapters.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setChapterId(c.id)}
                    className={clsx(
                      'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-ink-100',
                      chapterId === c.id && 'bg-ink-100 text-ink-900'
                    )}
                    type="button"
                  >
                    <span className="w-6 shrink-0 text-right text-xs text-ink-500">
                      {String(c.chapterNumber).padStart(2, '0')}
                    </span>
                    <span className="line-clamp-1">{c.title}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="mt-3 px-2">
            <button
              className="btn-primary w-full"
              disabled={busy.run || !chapterId}
              onClick={runCheck}
              type="button"
            >
              {busy.run ? '检查中…' : '运行一致性检查'}
            </button>
          </div>
        </div>

        <div className="card p-3">
          <div className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-ink-500">
            历史报告
          </div>
          {localReports.length === 0 ? (
            <div className="px-2 py-2 text-sm text-ink-500">尚无报告。</div>
          ) : (
            <ul className="space-y-1">
              {localReports.map((r) => (
                <li key={r.id}>
                  <div className="rounded-md px-2 py-1.5 text-sm hover:bg-ink-100">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink-500">
                        ch.{String(r.chapter?.chapterNumber ?? '?').padStart(2, '0')}
                      </span>
                      <span className="line-clamp-1 flex-1 text-ink-700">
                        {r.chapter?.title || '未知章节'}
                      </span>
                      <span
                        className={clsx(
                          'chip',
                          r.issues.filter((i) => !i.status || i.status === 'open').length > 0
                            ? 'chip-warn'
                            : 'chip-ok'
                        )}
                      >
                        {r.issues.filter((i) => !i.status || i.status === 'open').length} 待处理
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-500">
                      <span>{new Date(r.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>
                      {r.mock ? <span className="chip chip-warn">占位</span> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="space-y-4">
        {error ? (
          <div
            className="card-soft border border-danger/30 px-4 py-2 text-xs text-danger"
            role="alert"
            aria-live="assertive"
          >
            {error}
          </div>
        ) : null}
        {mocked ? (
          <div
            className="card-soft border border-warn/40 px-4 py-2 text-xs text-ink-700"
            role="status"
            aria-live="polite"
          >
            最近一次 AI 响应使用了占位数据（未配置 <code>OPENAI_API_KEY</code>），结果仅供参考。
          </div>
        ) : null}
        {localReports.length === 0 ? (
          <div className="card-soft px-6 py-10 text-center text-sm text-ink-500">
            还没有任何一致性报告。选择一个章节并点击「运行一致性检查」。
          </div>
        ) : (
          localReports.map((r) => {
            const open = r.issues.filter((i) => !i.status || i.status === 'open');
            const resolved = r.issues.filter((i) => i.status === 'resolved');
            const dismissed = r.issues.filter((i) => i.status === 'dismissed');
            return (
              <Section
                key={r.id}
                title={
                  r.chapter
                    ? `第 ${r.chapter.chapterNumber} 章 · ${r.chapter.title}`
                    : '未知章节'
                }
                description={`${new Date(r.createdAt).toLocaleString('zh-CN', {
                  hour12: false,
                })} · 共 ${r.issues.length} 个问题（${open.length} 待处理 / ${resolved.length} 已处理 / ${dismissed.length} 已忽略）`}
                right={
                  <Link
                    href={`/projects/${projectId}/chapters/${r.chapterId}`}
                    className="btn"
                  >
                    打开章节
                  </Link>
                }
              >
                {r.issues.length === 0 ? (
                  <div className="card-soft px-4 py-3 text-sm text-ok">未发现连续性问题。</div>
                ) : (
                  <ul className="space-y-3">
                    {r.issues.map((iss, idx) => {
                      const key = `${r.id}:${idx}`;
                      const fix = fixes[key];
                      const status = iss.status || 'open';
                      const isBusy = busy.issueKey === key;
                      return (
                        <li key={idx} className="card p-3">
                          <div className="flex items-center gap-2">
                            <SeverityBadge severity={iss.severity} />
                            <span className="font-mono text-[10px] text-ink-500">{iss.type}</span>
                            <span className="ml-auto">
                              <StatusBadge status={status} />
                            </span>
                          </div>
                          <div className="mt-2 text-sm text-ink-900">{iss.message}</div>

                          {iss.evidence.length > 0 ? (
                            <ul className="mt-2 space-y-1 border-l-2 border-ink-200 pl-3 text-xs text-ink-700">
                              {iss.evidence.map((e, i) => (
                                <li key={i}>
                                  <span className="font-mono text-[10px] text-ink-500">
                                    [{e.source}
                                    {e.chapterNumber ? ` ch.${e.chapterNumber}` : ''}
                                    {e.field ? ` · ${e.field}` : ''}]
                                  </span>{' '}
                                  「{e.quote}」
                                </li>
                              ))}
                            </ul>
                          ) : null}

                          {iss.suggestions.length > 0 ? (
                            <div className="mt-2 text-xs text-ink-700">
                              <span className="label">建议</span>
                              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                                {iss.suggestions.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {status === 'open' ? (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <button
                                className="btn-primary"
                                disabled={loadingFix[key] || pending}
                                onClick={() => getFix(r.id, idx)}
                                type="button"
                              >
                                {loadingFix[key]
                                  ? '生成中…'
                                  : fixes[key]
                                  ? '重新生成修复建议'
                                  : '生成修复建议'}
                              </button>
                              <button
                                className="btn"
                                disabled={isBusy || pending}
                                onClick={() => resolve(r.id, idx)}
                                type="button"
                              >
                                {isBusy && busy.issueKey === key ? '处理中…' : '标记为已处理'}
                              </button>
                              <button
                                className="btn-ghost"
                                onClick={() => dismiss(r.id, idx)}
                                disabled={isBusy}
                                type="button"
                              >
                                忽略
                              </button>
                            </div>
                          ) : null}

                          {fix ? <FixBlock suggestion={fix} /> : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>
            );
          })
        )}
      </main>
    </div>
  );
}

function FixBlock({ suggestion }: { suggestion: FixSuggestion }) {
  return (
    <div className="mt-3 rounded-md border border-ink-200 bg-ink-50 p-3">
      <div className="text-xs font-medium text-ink-700">修复建议</div>
      <p className="mt-1 text-sm text-ink-800">{suggestion.explanation}</p>
      <div className="mt-3 space-y-3">
        {suggestion.options.map((opt, i) => (
          <div
            key={i}
            className={`rounded-md border p-2 ${
              i === suggestion.recommended ? 'border-ok/30 bg-ok/5' : 'border-ink-200 bg-white'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-ink-900">
              <span>方案 {i + 1}</span>
              <span className="text-ink-700">{opt.title}</span>
              {i === suggestion.recommended ? <span className="chip chip-ok">推荐</span> : null}
            </div>
            <div className="mt-1 text-xs text-ink-600">{opt.description}</div>
            <pre className="mt-2 whitespace-pre-wrap rounded-md bg-white p-2 text-xs text-ink-800">
              {opt.patch}
            </pre>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] text-ink-500">
        提示：点击「打开章节」手动复制到正文。`applyPatchToChapter` 已实现，可由未来的「一键应用」按钮调用。
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  applyFactsToBibleAction,
  checkConsistencyAction,
  continueChapterAction,
  extractFactsAction,
  generateChapterAction,
  listFactExtractionsAction,
  polishChapterAction,
  saveChapterAction,
} from '@/app/actions';
import { Section, StatusBadge } from '@/components/ui';
import type {
  ChapterOutline,
  CreativeBrief,
  ConsistencyIssue,
  FactExtractionPayload,
  StoryBibleData,
} from '@/types/domain';
import { formatUserFacingError } from '@/lib/errors';
import { payloadToBibleRecords } from '@/lib/extraction';

const MAX_CONTENT = 1_000_000;
const MAX_TITLE = 200;
const MAX_SUMMARY = 2_000;

function normalizeIssue(raw: Partial<ConsistencyIssue> | null | undefined): ConsistencyIssue {
  const allowedSeverities = ['critical', 'warning', 'info'] as const;
  const allowedStatus = ['open', 'resolved', 'dismissed'] as const;
  const severity = (raw?.severity &&
  (allowedSeverities as readonly string[]).includes(raw.severity)
    ? raw.severity
    : 'info') as ConsistencyIssue['severity'];
  const status = (raw?.status &&
  (allowedStatus as readonly string[]).includes(raw.status)
    ? raw.status
    : 'open') as ConsistencyIssue['status'];

  return {
    severity,
    type: (raw?.type as ConsistencyIssue['type']) || 'style_or_constraint_violation',
    message: raw?.message || '未提供问题描述。',
    evidence: Array.isArray(raw?.evidence) ? raw.evidence : [],
    suggestions: Array.isArray(raw?.suggestions) ? raw.suggestions : [],
    status,
  };
}

function normalizeIssues(raw: unknown): ConsistencyIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => normalizeIssue(item as Partial<ConsistencyIssue>));
}

type ChapterRow = {
  id: string;
  chapterNumber: number;
  title: string;
  outline: ChapterOutline | null;
  content: string;
  summary: string;
  status: string;
};

type ProjectDetail = {
  brief: CreativeBrief | null;
  chapters: ChapterRow[];
  bible: StoryBibleData;
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export default function ChapterEditor({
  projectId,
  chapter: initialChapter,
  projectDetail,
}: {
  projectId: string;
  chapter: ChapterRow;
  projectDetail: ProjectDetail;
}) {
  const [chapter, setChapter] = useState<ChapterRow>(initialChapter);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<FactExtractionPayload | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [issues, setIssues] = useState<ConsistencyIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionText, setSelectionText] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [mockedLast, setMockedLast] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const opIdRef = useRef(0);
  const saveSeqRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<{ content: string; title: string }>({
    content: initialChapter.content,
    title: initialChapter.title,
  });
  const chapterRef = useRef(chapter);
  const projectDetailRef = useRef(projectDetail);
  chapterRef.current = chapter;
  projectDetailRef.current = projectDetail;

  const titleOver = chapter.title.length > MAX_TITLE;
  const summaryOver = chapter.summary.length > MAX_SUMMARY;
  const contentOver = chapter.content.length > MAX_CONTENT;
  const hasOverflow = titleOver || summaryOver || contentOver;

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }

  function markSaved(next: { content: string; title: string }) {
    lastSavedRef.current = next;
    setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    setSaveStatus('saved');
  }

  useEffect(() => {
    if (hasOverflow) {
      setSaveStatus('failed');
      return;
    }

    const timer = setTimeout(async () => {
      saveTimerRef.current = null;
      const last = lastSavedRef.current;
      if (chapter.content === last.content && chapter.title === last.title) return;

      setSaveStatus('saving');
      const mySeq = ++saveSeqRef.current;
      try {
        await saveChapterAction(chapter.id, {
          content: chapter.content,
          title: chapter.title,
        });
        if (mySeq === saveSeqRef.current) {
          markSaved({ content: chapter.content, title: chapter.title });
        }
      } catch (err) {
        if (mySeq === saveSeqRef.current) {
          setError(formatUserFacingError(err));
          setSaveStatus('failed');
        }
      }
    }, 1200);

    saveTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      saveTimerRef.current = null;
    };
  }, [chapter.content, chapter.id, chapter.title, hasOverflow]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      const last = lastSavedRef.current;
      if (chapter.content !== last.content || chapter.title !== last.title) {
        e.preventDefault();
        e.returnValue = '';
      }
    }

    function onVisibility() {
      if (document.visibilityState !== 'hidden') return;
      const last = lastSavedRef.current;
      if (chapter.content === last.content && chapter.title === last.title) return;

      const payload = JSON.stringify({
        id: chapter.id,
        data: { content: chapter.content, title: chapter.title },
      });

      try {
        navigator.sendBeacon?.('/api/chapter-save', new Blob([payload], { type: 'application/json' }));
      } catch {
        // ignore best-effort save failure
      }
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [chapter.content, chapter.id, chapter.title]);

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    opIdRef.current += 1;
    lastSavedRef.current = { content: initialChapter.content, title: initialChapter.title };
    setExtraction(null);
    setExtractionId(null);
    setIssues([]);
    setSaveStatus('idle');
    setError(null);
    setSelectionText('');
    setSelectionMode(false);
    setMockedLast(false);
  }, [initialChapter.content, initialChapter.id, initialChapter.title]);

  useEffect(() => {
    let cancelled = false;
    listFactExtractionsAction(chapter.id).then((rows) => {
      if (cancelled || rows.length === 0) return;
      const parsed = safeJson<FactExtractionPayload>(rows[0].payload);
      if (parsed) {
        setExtraction(parsed);
        setExtractionId(rows[0].id);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [chapter.id]);

  function safeJson<T>(raw: string): T | null {
    try {
      return JSON.parse(raw) as T;
    } catch {
      console.warn('[editor] failed to parse previous extraction');
      return null;
    }
  }

  async function save(opts: { silent?: boolean } = {}) {
    if (hasOverflow) {
      setError(`内容超出字符上限（标题 ${MAX_TITLE} / 摘要 ${MAX_SUMMARY} / 正文 ${MAX_CONTENT}）。`);
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setSaveStatus('saving');
    const mySeq = ++saveSeqRef.current;
    try {
      await saveChapterAction(chapter.id, {
        title: chapter.title,
        content: chapter.content,
        summary: chapter.summary,
        status: 'in_review',
      });
      if (mySeq === saveSeqRef.current) {
        setChapter((current) => ({ ...current, status: 'in_review' }));
        markSaved({ content: chapter.content, title: chapter.title });
        if (!opts.silent) flash('章节已保存。');
      }
    } catch (err) {
      if (mySeq === saveSeqRef.current) {
        setError(formatUserFacingError(err));
        setSaveStatus('failed');
      }
    }
  }

  async function generate() {
    setError(null);
    setBusyAction('generate');
    const myOp = ++opIdRef.current;

    try {
      const result = await generateChapterAction(chapterRef.current.id);
      if (myOp !== opIdRef.current) return;

      const next = {
        ...chapterRef.current,
        content: result.chapter.content,
        summary: result.chapter.summary,
        status: result.chapter.status,
      };
      setChapter(next);
      setMockedLast(!!result.mock);
      markSaved({ content: next.content, title: next.title });
      flash(result.mock ? '章节已生成，当前使用的是占位结果。' : '章节已生成。');
    } catch (err) {
      if (myOp === opIdRef.current) setError(formatUserFacingError(err));
    } finally {
      if (myOp === opIdRef.current) setBusyAction(null);
    }
  }

  async function continueWriting() {
    setError(null);
    setBusyAction('continue');
    const myOp = ++opIdRef.current;

    try {
      const result = await continueChapterAction(chapterRef.current.id);
      if (myOp !== opIdRef.current) return;

      const next = {
        ...chapterRef.current,
        content: result.chapter.content,
        summary: result.chapter.summary,
        status: result.chapter.status,
      };
      setChapter(next);
      setMockedLast(!!result.mock);
      markSaved({ content: next.content, title: next.title });
      flash(result.mock ? '续写已完成，当前使用的是占位结果。' : '已续写一段。');
    } catch (err) {
      if (myOp === opIdRef.current) setError(formatUserFacingError(err));
    } finally {
      if (myOp === opIdRef.current) setBusyAction(null);
    }
  }

  async function polish(target: 'selection' | 'full') {
    setError(null);
    if (target === 'selection' && !selectionText.trim()) {
      setError('请先选中要润色的段落。');
      return;
    }

    setBusyAction(target === 'selection' ? 'polish-selection' : 'polish-full');
    const myOp = ++opIdRef.current;

    try {
      const result = await polishChapterAction(
        chapterRef.current.id,
        target,
        target === 'selection' ? selectionText : undefined
      );
      if (myOp !== opIdRef.current) return;

      const next = {
        ...chapterRef.current,
        content: result.chapter.content,
      };
      setChapter(next);
      setMockedLast(!!result.mock);
      markSaved({ content: next.content, title: next.title });
      flash(target === 'selection' ? '选中段落已润色。' : '全文已润色。');
      if (target === 'selection') setSelectionText('');
    } catch (err) {
      if (myOp === opIdRef.current) setError(formatUserFacingError(err));
    } finally {
      if (myOp === opIdRef.current) setBusyAction(null);
    }
  }

  async function extractFacts() {
    setError(null);
    setBusyAction('extract');
    const myOp = ++opIdRef.current;

    try {
      const { id, payload, mock } = await extractFactsAction(chapter.id);
      if (myOp !== opIdRef.current) return;
      setExtraction(payload);
      setExtractionId(id);
      setMockedLast(!!mock);
      flash(mock ? '事实已抽取，当前使用的是占位结果。' : '事实已抽取。');
    } catch (err) {
      if (myOp === opIdRef.current) setError(formatUserFacingError(err));
    } finally {
      if (myOp === opIdRef.current) setBusyAction(null);
    }
  }

  async function applyAll() {
    if (!extraction) return;

    setError(null);
    setBusyAction('applyAll');
    const myOp = ++opIdRef.current;

    try {
      const records = payloadToBibleRecords(extraction, chapter.id, projectDetailRef.current.bible);
      await applyFactsToBibleAction(projectId, records, extractionId ?? undefined);
      if (myOp !== opIdRef.current) return;
      flash('已全部写入 Story Bible。');
    } catch (err) {
      if (myOp === opIdRef.current) setError(formatUserFacingError(err));
    } finally {
      if (myOp === opIdRef.current) setBusyAction(null);
    }
  }

  async function runConsistency() {
    setError(null);
    setBusyAction('consistency');
    const myOp = ++opIdRef.current;

    try {
      const current = chapterRef.current;
      setSaveStatus('saving');
      const mySeq = ++saveSeqRef.current;
      await saveChapterAction(current.id, { content: current.content, title: current.title });
      if (mySeq === saveSeqRef.current) {
        markSaved({ content: current.content, title: current.title });
      }

      if (myOp !== opIdRef.current) return;

      const result = await checkConsistencyAction(current.id);
      if (myOp !== opIdRef.current) return;
      setIssues(normalizeIssues(result.issues));
      setMockedLast(!!result.mock);
      flash(
        `${result.mock ? '一致性检查已完成，当前使用的是占位结果。' : '一致性检查已完成。'}共发现 ${result.issues.length} 个问题。`
      );
    } catch (err) {
      if (myOp === opIdRef.current) setError(formatUserFacingError(err));
    } finally {
      if (myOp === opIdRef.current) setBusyAction(null);
    }
  }

  const wordCount = chapter.content.length;
  const relatedCharacters = useMemo(
    () =>
      projectDetail.bible.characters.filter((item) =>
        (chapter.outline?.relatedCharacters ?? []).some((name) => name === item.name)
      ),
    [chapter.outline?.relatedCharacters, projectDetail.bible.characters]
  );

  const prevChapterSummary = useMemo(
    () =>
      projectDetail.chapters
        .filter((item) => item.chapterNumber < chapter.chapterNumber)
        .sort((a, b) => b.chapterNumber - a.chapterNumber)[0]?.summary || '',
    [chapter.chapterNumber, projectDetail.chapters]
  );

  const activeForeshadowing = useMemo(
    () => projectDetail.bible.foreshadowing.filter((item) => item.status === 'active'),
    [projectDetail.bible.foreshadowing]
  );

  function captureSelection() {
    if (!taRef.current) return;
    const start = taRef.current.selectionStart;
    const end = taRef.current.selectionEnd;
    if (start === end) {
      setSelectionText('');
      return;
    }
    setSelectionText(chapter.content.slice(start, end));
  }

  const anyBusy = !!busyAction || saveStatus === 'saving';

  return (
    <div className="grid min-h-[calc(100vh-130px)] grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_360px]">
      <aside className="card scroll-thin overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between px-2 text-xs font-medium uppercase tracking-wider text-ink-500">
          <span>章节</span>
          <Link href={`/projects/${projectId}/chapters`} className="text-ink-500 hover:text-ink-800">
            列表
          </Link>
        </div>
        <ul className="space-y-1">
          {projectDetail.chapters.map((item) => (
            <li key={item.id}>
              <Link
                href={`/projects/${projectId}/chapters/${item.id}`}
                className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-ink-100 ${
                  item.id === chapter.id ? 'bg-ink-100 text-ink-900' : 'text-ink-700'
                }`}
              >
                <span className="w-6 shrink-0 text-right text-xs text-ink-500">
                  {String(item.chapterNumber).padStart(2, '0')}
                </span>
                <span className="line-clamp-1">{item.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className="card flex flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
          <span className="font-mono text-sm text-ink-500">
            Ch.{String(chapter.chapterNumber).padStart(2, '0')}
          </span>
          <input
            value={chapter.title}
            onChange={(e) => setChapter((current) => ({ ...current, title: e.target.value }))}
            className={`min-w-0 flex-1 bg-transparent text-lg font-semibold focus:outline-none ${
              titleOver ? 'text-danger' : 'text-ink-900'
            }`}
            aria-label="章节标题"
            maxLength={MAX_TITLE}
          />
          <StatusBadge status={chapter.status} />
          <SaveIndicator
            status={saveStatus}
            savedAt={savedAt}
            wordCount={wordCount}
            mock={mockedLast}
          />
        </div>

        {hasOverflow ? (
          <div className="border-b border-danger/30 bg-danger/5 px-4 py-2 text-xs text-danger">
            已超过字符上限：标题 {chapter.title.length}/{MAX_TITLE}，摘要 {chapter.summary.length}/{MAX_SUMMARY}，正文 {chapter.content.length}/{MAX_CONTENT}。请精简后再保存。
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-2 text-sm">
          <button className="btn" disabled={anyBusy || hasOverflow} onClick={generate} type="button">
            {busyAction === 'generate' ? '生成中...' : '生成本章'}
          </button>
          <button
            className="btn"
            disabled={anyBusy || !chapter.content || hasOverflow}
            onClick={continueWriting}
            type="button"
          >
            {busyAction === 'continue' ? '续写中...' : '续写一段'}
          </button>
          <span className="mx-2 h-4 w-px bg-ink-200" />
          <button
            className={selectionMode ? 'btn-primary' : 'btn'}
            onClick={() => {
              const next = !selectionMode;
              setSelectionMode(next);
              if (next) setTimeout(captureSelection, 0);
            }}
            type="button"
            title="开启后可选中文本，再点击“润色选段”"
            aria-pressed={selectionMode}
          >
            {selectionMode ? '选段模式：开' : '选段模式：关'}
          </button>
          <button
            className="btn"
            disabled={anyBusy || !selectionText || hasOverflow}
            onClick={() => polish('selection')}
            type="button"
          >
            {busyAction === 'polish-selection' ? '润色中...' : '润色选段'}
          </button>
          <button
            className="btn"
            disabled={anyBusy || !chapter.content || hasOverflow}
            onClick={() => polish('full')}
            type="button"
          >
            {busyAction === 'polish-full' ? '润色中...' : '润色全文'}
          </button>
          <span className="ml-auto" />
          <button
            className="btn-primary"
            disabled={saveStatus === 'saving' || hasOverflow}
            onClick={() => save()}
            type="button"
          >
            {saveStatus === 'saving' ? '保存中...' : '保存章节'}
          </button>
        </div>

        <textarea
          ref={taRef}
          value={chapter.content}
          onChange={(e) => setChapter((current) => ({ ...current, content: e.target.value }))}
          onSelect={selectionMode ? captureSelection : undefined}
          className="prose-novel scroll-thin min-h-0 flex-1 resize-none border-0 px-6 py-5 focus:outline-none"
          placeholder="在这里写作，或点击“生成本章”让 AI 起笔。"
        />

        {error ? (
          <div
            className="border-t border-danger/30 bg-danger/5 px-4 py-2 text-xs text-danger"
            role="alert"
            aria-live="assertive"
          >
            {error}
          </div>
        ) : null}
        {toast ? (
          <div className="fixed bottom-6 right-6 card px-3 py-2 text-sm" role="status" aria-live="polite">
            {toast}
          </div>
        ) : null}
      </section>

      <aside className="card scroll-thin flex flex-col overflow-hidden">
        <div className="border-b border-ink-200 px-4 py-3">
          <div className="text-sm font-semibold text-ink-900">AI 助手</div>
          <div className="text-xs text-ink-500">事实抽取、一致性检查、上下文辅助</div>
        </div>

        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
          {projectDetail.bible.characters.length === 0 ? (
            <div className="card-soft px-3 py-2 text-xs text-ink-500">
              提示：先在“提示词”页采纳 brief，会自动初始化 Story Bible。
            </div>
          ) : null}

          <Section title="上下文" description="写作时，AI 会读取这些信息。">
            <div className="space-y-2 text-xs text-ink-700">
              <div>
                <span className="label">上一章摘要</span>
                <div className="mt-1 rounded-md bg-ink-50 p-2">{prevChapterSummary || '（无）'}</div>
              </div>
              <div>
                <span className="label">本章大纲</span>
                <div className="mt-1 rounded-md bg-ink-50 p-2">
                  {chapter.outline?.goal || '（暂无大纲）'}
                </div>
              </div>
              <div>
                <span className="label">关联角色</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {relatedCharacters.length ? (
                    relatedCharacters.map((item) => (
                      <span key={item.id} className="chip">
                        {item.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-ink-500">（未指定）</span>
                  )}
                </div>
              </div>
              {activeForeshadowing.length > 0 ? (
                <div>
                  <span className="label">未回收伏笔</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {activeForeshadowing.map((item) => (
                      <span key={item.id} className="chip chip-warn">
                        {item.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Section>

          <Section
            title="事实抽取"
            description="从本章正文中抽取信息并写入 Story Bible。"
            right={
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/projects/${projectId}/chapters/${chapter.id}/extractions`}
                  className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-800"
                >
                  查看历史
                </Link>
                <button
                  className="btn"
                  disabled={anyBusy || !chapter.content || hasOverflow}
                  onClick={extractFacts}
                  type="button"
                >
                  {busyAction === 'extract' ? '抽取中...' : '抽取事实'}
                </button>
                <button
                  className="btn-primary"
                  disabled={anyBusy || !extraction}
                  onClick={applyAll}
                  type="button"
                >
                  {busyAction === 'applyAll' ? '写入中...' : '全部写入'}
                </button>
              </div>
            }
          >
            {!extraction ? (
              <div className="text-xs text-ink-500">点击“抽取事实”开始。</div>
            ) : (
              <div className="space-y-3 text-xs">
                {extraction.characters.length > 0 ? (
                  <Group
                    title="人物"
                    items={extraction.characters.map((item) => `${item.name} · ${item.role} · ${item.status}`)}
                  />
                ) : null}
                {extraction.locations.length > 0 ? (
                  <Group
                    title="地点"
                    items={extraction.locations.map((item) => `${item.name} · ${item.description}`)}
                  />
                ) : null}
                {extraction.items.length > 0 ? (
                  <Group
                    title="物品"
                    items={extraction.items.map((item) => `${item.name} · ${item.description}`)}
                  />
                ) : null}
                {extraction.events.length > 0 ? (
                  <Group
                    title="关键事件"
                    items={extraction.events.map((item) => `${item.name} · ${item.description}`)}
                  />
                ) : null}
                {extraction.foreshadowing.length > 0 ? (
                  <Group
                    title="伏笔"
                    items={extraction.foreshadowing.map((item) => `${item.name} · ${item.description}`)}
                  />
                ) : null}
                {extraction.characterStatusChanges.length > 0 ? (
                  <Group
                    title="人物状态变化"
                    items={extraction.characterStatusChanges.map(
                      (item) => `${item.character}: ${item.before || '?'} -> ${item.after}`
                    )}
                  />
                ) : null}
                {extraction.timeline.length > 0 ? (
                  <Group
                    title="时间线"
                    items={extraction.timeline.map((item) => `${item.name} · ${item.description}`)}
                  />
                ) : null}
                {extraction.worldRules.length > 0 ? (
                  <Group
                    title="世界规则"
                    items={extraction.worldRules.map((item) => `${item.name} · ${item.description}`)}
                  />
                ) : null}
              </div>
            )}
          </Section>

          <Section
            title="一致性检查"
            description="对照 Story Bible 检查本章。"
            right={
              <button
                className="btn"
                disabled={anyBusy || !chapter.content || hasOverflow}
                onClick={runConsistency}
                type="button"
              >
                {busyAction === 'consistency' ? '检查中...' : '检查一致性'}
              </button>
            }
          >
            {issues.length === 0 ? (
              <div className="text-xs text-ink-500">暂无问题，或尚未运行检查。</div>
            ) : (
              <ul className="space-y-2">
                {issues.map((issue, index) => (
                  <li key={index} className="card-soft p-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={
                          issue.severity === 'critical'
                            ? 'chip chip-danger'
                            : issue.severity === 'warning'
                              ? 'chip chip-warn'
                              : 'chip'
                        }
                      >
                        {issue.severity}
                      </span>
                      <span className="font-mono text-[10px] text-ink-500">{issue.type}</span>
                    </div>
                    <div className="mt-1 text-xs text-ink-800">{issue.message}</div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 text-right">
              <Link
                href={`/projects/${projectId}/consistency`}
                className="text-xs text-ink-600 hover:underline"
              >
                查看完整一致性报告 {'->'}
              </Link>
            </div>
          </Section>
        </div>
      </aside>
    </div>
  );
}

function SaveIndicator({
  status,
  savedAt,
  wordCount,
  mock,
}: {
  status: SaveStatus;
  savedAt: string | null;
  wordCount: number;
  mock: boolean;
}) {
  if (status === 'saving') {
    return (
      <span className="text-xs text-ink-500" role="status" aria-live="polite">
        保存中...
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span
        className="text-xs text-danger"
        role="status"
        aria-live="assertive"
        title="点击“保存章节”可重试"
      >
        保存失败，点击保存重试
      </span>
    );
  }

  if (status === 'saved' && savedAt) {
    return (
      <span className="text-xs text-ok" role="status" aria-live="polite">
        {mock ? '已保存（占位结果）' : '已保存'} · {savedAt}
      </span>
    );
  }

  return (
    <span className="text-xs text-ink-500" aria-live="off">
      {wordCount} 字
    </span>
  );
}

function Group({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="label">{title}</div>
      <ul className="mt-1 space-y-1">
        {items.map((item, index) => (
          <li key={index} className="rounded-md bg-ink-50 px-2 py-1">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

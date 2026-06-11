'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  applyFactsToBibleAction,
  checkConsistencyAction,
  extractFactsAction,
  listFactExtractionsAction,
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
import type { ChapterGenerationContext } from '@/lib/ai/service';
import { UserError, formatUserFacingError } from '@/lib/errors';
import { payloadToBibleRecords } from '@/lib/extraction';

const MAX_CONTENT = 1_000_000;
const MAX_TITLE = 200;
const MAX_SUMMARY = 2_000;

// Normalize a `ConsistencyIssue` coming out of a JSON parse so the UI can rely
// on `severity`, `type`, `evidence`, `suggestions`, and `status` always existing.
function normalizeIssue(raw: Partial<ConsistencyIssue> | null | undefined): ConsistencyIssue {
  const allowedSeverities = ['critical', 'warning', 'info'] as const;
  const allowedStatus = ['open', 'resolved', 'dismissed'] as const;
  const sev = (raw?.severity && (allowedSeverities as readonly string[]).includes(raw.severity)
    ? raw.severity
    : 'info') as ConsistencyIssue['severity'];
  const st = (raw?.status && (allowedStatus as readonly string[]).includes(raw.status)
    ? raw.status
    : 'open') as ConsistencyIssue['status'];
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



// `payloadToBibleRecords` lives in `@/lib/extraction`; see imports above.

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
  const router = useRouter();
  const [chapter, setChapter] = useState<ChapterRow>(initialChapter);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<FactExtractionPayload | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [issues, setIssues] = useState<ConsistencyIssue[]>([]);
  const [startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionText, setSelectionText] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [mockedLast, setMockedLast] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Cross-chapter async coordination. Every async operation captures a token;
  // when the user switches chapters, the token is invalidated and the result
  // is discarded so we never write stale data into a different chapter.
  const opIdRef = useRef(0);
  const chapterIdRef = useRef(initialChapter.id);
  chapterIdRef.current = chapter.id;

  // Auto-save sequence token. If a save is in flight and another debounce
  // fires, only the highest sequence's response updates `lastSavedRef`.
  const saveSeqRef = useRef(0);

  // Auto-save debounce handle (so manual save can cancel it).
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the last content we successfully confirmed on the server.
  const lastSavedRef = useRef<{ content: string; title: string }>({
    content: initialChapter.content,
    title: initialChapter.title,
  });

  // Refs that mirror latest state for use inside async handlers and
  // `useEffect` callbacks that close over older values.
  const chapterRef = useRef(chapter);
  chapterRef.current = chapter;
  const projectDetailRef = useRef(projectDetail);
  projectDetailRef.current = projectDetail;

  const titleOver = chapter.title.length > MAX_TITLE;
  const summaryOver = chapter.summary.length > MAX_SUMMARY;
  const contentOver = chapter.content.length > MAX_CONTENT;
  const hasOverflow = titleOver || summaryOver || contentOver;

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // Debounced auto-save. Skipped when busy (any AI action also saves directly).
  useEffect(() => {
    if (hasOverflow) {
      // Don't try to save an over-cap document; show a clear "won't save" hint.
      setSaveStatus('failed');
      return;
    }
    const t = setTimeout(async () => {
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
        // Only update the baseline if this is still the latest save.
        if (mySeq === saveSeqRef.current) {
          lastSavedRef.current = { content: chapter.content, title: chapter.title };
          setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
          setSaveStatus('saved');
        }
      } catch (err) {
        if (mySeq === saveSeqRef.current) {
          setError(formatUserFacingError(err));
          setSaveStatus('failed');
        }
      }
    }, 1200);
    saveTimerRef.current = t;
    return () => {
      clearTimeout(t);
      saveTimerRef.current = null;
    };
  }, [chapter.content, chapter.title, chapter.id, hasOverflow]);

  // Beforeunload: warn if the user has unsaved content.
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
      // Best-effort fire-and-forget save. Browsers may abort, but the user's
      // local state is preserved in React for the next mount.
      const payload = JSON.stringify({
        id: chapter.id,
        data: { content: chapter.content, title: chapter.title },
      });
      try {
        navigator.sendBeacon?.(`/api/chapter-save`, new Blob([payload], { type: 'application/json' }));
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [chapter.id, chapter.content, chapter.title]);

  // Reset panel state, baseline, and cancel pending saves when switching chapters.
  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    // Bump op token so any in-flight extraction / consistency writes get discarded.
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
  }, [initialChapter.id, initialChapter.content, initialChapter.title]);

  // Load any previous extraction to show in the panel. Capture the row id
  // so "全部写入" can mark the source as applied on the server.
  useEffect(() => {
    const myChapterId = chapter.id;
    let cancelled = false;
    listFactExtractionsAction(myChapterId).then((rows) => {
      if (cancelled) return;
      if (rows.length) {
        const parsed = safeJson(rows[0].payload);
        if (parsed) {
          setExtraction(parsed);
          setExtractionId(rows[0].id);
        }
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
      setError(`内容超出字符上限（标题 ${MAX_TITLE} / 摘要 ${MAX_SUMMARY} / 正文 ${MAX_CONTENT}）`);
      return;
    }
    // Cancel any pending debounce so we don't double-save.
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
        lastSavedRef.current = { content: chapter.content, title: chapter.title };
        setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
        setChapter((c) => ({ ...c, status: 'in_review' }));
        setSaveStatus('saved');
        if (!opts.silent) flash('已保存');
      }
    } catch (err) {
      if (mySeq === saveSeqRef.current) {
        setError(formatUserFacingError(err));
        setSaveStatus('failed');
      }
    }
  }

  function buildContext(): ChapterGenerationContext {
    const pd = projectDetailRef.current;
    const ch = chapterRef.current;
    const brief = pd.brief;
    const prev = pd.chapters
      .filter((c) => c.chapterNumber < ch.chapterNumber)
      .sort((a, b) => b.chapterNumber - a.chapterNumber)[0];
    return {
      brief,
      chapterNumber: ch.chapterNumber,
      title: ch.title,
      outline: ch.outline || {
        goal: '',
        summary: '',
        requiredBeats: [],
        relatedCharacters: [],
        relatedForeshadowing: [],
      },
      previousChapterSummary: prev?.summary || '',
      characters: pd.bible.characters,
      locations: pd.bible.locations,
      items: pd.bible.items,
      worldRules: pd.bible.worldRules,
      foreshadowing: pd.bible.foreshadowing.filter((f) => f.status === 'active'),
      writingConstraints: brief?.writingConstraints ?? [],
    };
  }

  async function generate() {
    setError(null);
    setBusyAction('generate');
    const myOp = ++opIdRef.current;
    try {
      const { generateChapter } = await import('@/lib/ai/service');
      const result = await generateChapter(buildContext());
      if (myOp !== opIdRef.current) return; // user switched chapters
      const current = chapterRef.current;
      setMockedLast(!!result.mock);
      const next = {
        ...current,
        content: result.content,
        summary: result.summary,
        status: 'generated' as const,
      };
      setChapter(next);
      setSaveStatus('saving');
      const mySeq = ++saveSeqRef.current;
      await saveChapterAction(current.id, {
        content: result.content,
        summary: result.summary,
        status: 'generated',
      });
      if (mySeq === saveSeqRef.current) {
        lastSavedRef.current = { content: result.content, title: next.title };
        setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
        setSaveStatus('saved');
      }
      flash(result.mock ? '已生成（占位数据）' : '章节已生成');
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
      const { continueChapter } = await import('@/lib/ai/service');
      const current = chapterRef.current;
      const pd = projectDetailRef.current;
      const result = await continueChapter({
        chapterNumber: current.chapterNumber,
        title: current.title,
        existingContent: current.content,
        previousSummary:
          pd.chapters
            .filter((c) => c.chapterNumber < current.chapterNumber)
            .sort((a, b) => b.chapterNumber - a.chapterNumber)[0]?.summary || '',
        characters: pd.bible.characters.map((c) => ({
          name: c.name,
          description: c.description,
          status: c.status,
        })),
      });
      if (myOp !== opIdRef.current) return;
      setMockedLast(!!result.mock);
      const nextContent = current.content + result.content;
      const next = { ...current, content: nextContent, summary: result.summary };
      setChapter(next);
      setSaveStatus('saving');
      const mySeq = ++saveSeqRef.current;
      await saveChapterAction(current.id, { content: nextContent, summary: result.summary });
      if (mySeq === saveSeqRef.current) {
        lastSavedRef.current = { content: nextContent, title: next.title };
        setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
        setSaveStatus('saved');
      }
      flash(result.mock ? '已续写一段（占位数据）' : '已续写一段');
    } catch (err) {
      if (myOp === opIdRef.current) setError(formatUserFacingError(err));
    } finally {
      if (myOp === opIdRef.current) setBusyAction(null);
    }
  }

  async function polish(target: 'selection' | 'full') {
    setError(null);
    if (target === 'selection' && !selectionText.trim()) {
      setError('请先在正文中选中要润色的段落。');
      return;
    }
    setBusyAction(target === 'selection' ? 'polish-selection' : 'polish-full');
    const myOp = ++opIdRef.current;
    try {
      const { polishText } = await import('@/lib/ai/service');
      const current = chapterRef.current;
      let text = current.content;
      if (target === 'selection') {
        // Refuse to silently no-op or replace all: require exactly one occurrence
        // in the current text. This protects against the user editing after
        // selecting, or repeated phrases.
        if (current.content.split(selectionText).length !== 2) {
          throw new UserError('选段内容已被修改，无法定位。请重新选中。', 'selection_stale');
        }
        text = selectionText;
      }
      const { content } = await polishText({ text, mode: target });
      if (myOp !== opIdRef.current) return;
      const nextContent =
        target === 'selection'
          ? current.content.split(selectionText).join(content)
          : content;
      const next = { ...current, content: nextContent };
      setChapter(next);
      setSaveStatus('saving');
      const mySeq = ++saveSeqRef.current;
      await saveChapterAction(current.id, { content: nextContent });
      if (mySeq === saveSeqRef.current) {
        lastSavedRef.current = { content: nextContent, title: next.title };
        setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
        setSaveStatus('saved');
      }
      flash(target === 'selection' ? '已润色选段' : '已润色全文');
      // Clear the captured selection text after a successful apply so the
      // button disables until the user makes a new selection.
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
      flash(mock ? '已抽取事实（占位数据）' : '已抽取事实');
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
      flash('已全部写入 Story Bible');
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
      // Persist latest edit so the consistency check sees the same text we'll show.
      setSaveStatus('saving');
      const mySeq = ++saveSeqRef.current;
      await saveChapterAction(current.id, { content: current.content, title: current.title });
      if (mySeq === saveSeqRef.current) {
        lastSavedRef.current = { content: current.content, title: current.title };
        setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
        setSaveStatus('saved');
      }
      if (myOp !== opIdRef.current) return;
      const result = await checkConsistencyAction(current.id);
      if (myOp !== opIdRef.current) return;
      setIssues(normalizeIssues(result.issues));
      setMockedLast(!!result.mock);
      flash(
        `${result.mock ? '检查完成（占位数据），' : '检查完成，'}发现 ${result.issues.length} 个问题`
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
      projectDetail.bible.characters.filter((c) =>
        (chapter.outline?.relatedCharacters ?? []).some((n) => n === c.name)
      ),
    [projectDetail.bible.characters, chapter.outline?.relatedCharacters]
  );

  const prevChapterSummary = useMemo(() => {
    return (
      projectDetail.chapters
        .filter((c) => c.chapterNumber < chapter.chapterNumber)
        .sort((a, b) => b.chapterNumber - a.chapterNumber)[0]?.summary || ''
    );
  }, [projectDetail.chapters, chapter.chapterNumber]);

  const activeForeshadowing = useMemo(
    () => projectDetail.bible.foreshadowing.filter((f) => f.status === 'active'),
    [projectDetail.bible.foreshadowing]
  );

  function captureSelection() {
    if (!taRef.current) return;
    const start = taRef.current.selectionStart;
    const end = taRef.current.selectionEnd;
    if (start === end) {
      // No selection — don't disable selection mode; just clear the captured text.
      setSelectionText('');
      return;
    }
    setSelectionText(chapter.content.slice(start, end));
  }

  const busy = !!busyAction;
  const anyBusy = busy || saveStatus === 'saving';

  return (
    <div className="grid min-h-[calc(100vh-130px)] grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_360px]">
      {/* Left: chapter list */}
      <aside className="card scroll-thin overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between px-2 text-xs font-medium uppercase tracking-wider text-ink-500">
          <span>章节</span>
          <Link href={`/projects/${projectId}/chapters`} className="text-ink-500 hover:text-ink-800">
            列表
          </Link>
        </div>
        <ul className="space-y-1">
          {projectDetail.chapters.map((c) => (
            <li key={c.id}>
              <Link
                href={`/projects/${projectId}/chapters/${c.id}`}
                className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-ink-100 ${
                  c.id === chapter.id ? 'bg-ink-100 text-ink-900' : 'text-ink-700'
                }`}
              >
                <span className="w-6 shrink-0 text-right text-xs text-ink-500">
                  {String(c.chapterNumber).padStart(2, '0')}
                </span>
                <span className="line-clamp-1">{c.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      {/* Middle: editor */}
      <section className="card flex flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
          <span className="font-mono text-sm text-ink-500">
            Ch.{String(chapter.chapterNumber).padStart(2, '0')}
          </span>
          <input
            value={chapter.title}
            onChange={(e) => setChapter((c) => ({ ...c, title: e.target.value }))}
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
            已超过字符上限：标题 {chapter.title.length}/{MAX_TITLE}，摘要{' '}
            {chapter.summary.length}/{MAX_SUMMARY}，正文 {chapter.content.length}/{MAX_CONTENT}。
            请精简后再保存。
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-2 text-sm">
          <button
            className="btn"
            disabled={anyBusy || hasOverflow}
            onClick={generate}
            type="button"
          >
            {busyAction === 'generate' ? '生成中…' : '生成本章'}
          </button>
          <button
            className="btn"
            disabled={anyBusy || !chapter.content || hasOverflow}
            onClick={continueWriting}
            type="button"
          >
            {busyAction === 'continue' ? '续写中…' : '续写一段'}
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
            title="切换到选段模式：在正文中选中要润色的文字，再点击「润色选段」"
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
            {busyAction === 'polish-selection' ? '润色中…' : '润色选段'}
          </button>
          <button
            className="btn"
            disabled={anyBusy || !chapter.content || hasOverflow}
            onClick={() => polish('full')}
            type="button"
          >
            {busyAction === 'polish-full' ? '润色中…' : '润色全文'}
          </button>
          <span className="ml-auto" />
          <button
            className="btn-primary"
            disabled={saveStatus === 'saving' || hasOverflow}
            onClick={() => save()}
            type="button"
          >
            {saveStatus === 'saving' ? '保存中…' : '保存章节'}
          </button>
        </div>

        <textarea
          ref={taRef}
          value={chapter.content}
          onChange={(e) => setChapter((c) => ({ ...c, content: e.target.value }))}
          onSelect={selectionMode ? captureSelection : undefined}
          className="prose-novel scroll-thin min-h-0 flex-1 resize-none border-0 px-6 py-5 focus:outline-none"
          placeholder="在这里写，或点击「生成本章」让 AI 起笔……"
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
          <div
            className="fixed bottom-6 right-6 card px-3 py-2 text-sm"
            role="status"
            aria-live="polite"
          >
            {toast}
          </div>
        ) : null}
      </section>

      {/* Right: AI assistant panel */}
      <aside className="card scroll-thin flex flex-col overflow-hidden">
        <div className="border-b border-ink-200 px-4 py-3">
          <div className="text-sm font-semibold text-ink-900">AI 助手</div>
          <div className="text-xs text-ink-500">事实抽取 · 一致性检查 · 上下文</div>
        </div>

        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
          {projectDetail.bible.characters.length === 0 ? (
            <div className="card-soft px-3 py-2 text-xs text-ink-500">
              提示：先在「提示词」页面采用 brief，会自动初始化 Story Bible。
            </div>
          ) : null}

          <Section title="上下文" description="写作时 AI 会读取这些信息">
            <div className="space-y-2 text-xs text-ink-700">
              <div>
                <span className="label">上一章摘要</span>
                <div className="mt-1 rounded-md bg-ink-50 p-2">
                  {prevChapterSummary || '（无）'}
                </div>
              </div>
              <div>
                <span className="label">本章大纲</span>
                <div className="mt-1 rounded-md bg-ink-50 p-2">
                  {chapter.outline?.goal || '（无大纲）'}
                </div>
              </div>
              <div>
                <span className="label">关联角色</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {relatedCharacters.length ? (
                    relatedCharacters.map((c) => (
                      <span key={c.id} className="chip">
                        {c.name}
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
                    {activeForeshadowing.map((f) => (
                      <span key={f.id} className="chip chip-warn">
                        {f.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Section>

          <Section
            title="事实抽取"
            description="从本章正文中抽取并写入 Story Bible"
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
                  {busyAction === 'extract' ? '抽取中…' : '抽取事实'}
                </button>
                <button
                  className="btn-primary"
                  disabled={anyBusy || !extraction}
                  onClick={applyAll}
                  type="button"
                >
                  {busyAction === 'applyAll' ? '写入中…' : '全部写入'}
                </button>
              </div>
            }
          >
            {!extraction ? (
              <div className="text-xs text-ink-500">点击「抽取事实」开始。</div>
            ) : (
              <div className="space-y-3 text-xs">
                {extraction.characters.length > 0 ? (
                  <Group
                    title="人物"
                    items={extraction.characters.map((c) => `${c.name} · ${c.role} · ${c.status}`)}
                  />
                ) : null}
                {extraction.locations.length > 0 ? (
                  <Group
                    title="地点"
                    items={extraction.locations.map((l) => `${l.name} · ${l.description}`)}
                  />
                ) : null}
                {extraction.items.length > 0 ? (
                  <Group
                    title="物品"
                    items={extraction.items.map((i) => `${i.name} · ${i.description}`)}
                  />
                ) : null}
                {extraction.events.length > 0 ? (
                  <Group
                    title="关键事件"
                    items={extraction.events.map((e) => `${e.name} · ${e.description}`)}
                  />
                ) : null}
                {extraction.foreshadowing.length > 0 ? (
                  <Group
                    title="伏笔"
                    items={extraction.foreshadowing.map(
                      (f) => `${f.name} · ${f.description}`
                    )}
                  />
                ) : null}
                {extraction.characterStatusChanges.length > 0 ? (
                  <Group
                    title="人物状态变化"
                    items={extraction.characterStatusChanges.map(
                      (c) => `${c.character}: ${c.before || '?'} → ${c.after}`
                    )}
                  />
                ) : null}
                {extraction.timeline.length > 0 ? (
                  <Group
                    title="时间线"
                    items={extraction.timeline.map(
                      (t) => `${t.name} · ${t.description}`
                    )}
                  />
                ) : null}
                {extraction.worldRules.length > 0 ? (
                  <Group
                    title="世界规则"
                    items={extraction.worldRules.map(
                      (r) => `${r.name} · ${r.description}`
                    )}
                  />
                ) : null}
              </div>
            )}
          </Section>

          <Section
            title="一致性检查"
            description="对照 Story Bible 检查本章"
            right={
              <button
                className="btn"
                disabled={anyBusy || !chapter.content || hasOverflow}
                onClick={runConsistency}
                type="button"
              >
                {busyAction === 'consistency' ? '检查中…' : '检查一致性'}
              </button>
            }
          >
            {issues.length === 0 ? (
              <div className="text-xs text-ink-500">暂无问题，或尚未运行检查。</div>
            ) : (
              <ul className="space-y-2">
                {issues.map((iss, i) => (
                  <li key={i} className="card-soft p-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={
                          iss.severity === 'critical'
                            ? 'chip chip-danger'
                            : iss.severity === 'warning'
                            ? 'chip chip-warn'
                            : 'chip'
                        }
                      >
                        {iss.severity}
                      </span>
                      <span className="font-mono text-[10px] text-ink-500">{iss.type}</span>
                    </div>
                    <div className="mt-1 text-xs text-ink-800">{iss.message}</div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 text-right">
              <Link
                href={`/projects/${projectId}/consistency`}
                className="text-xs text-ink-600 hover:underline"
              >
                查看完整一致性报告 →
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
      <span
        className="text-xs text-ink-500"
        role="status"
        aria-live="polite"
      >
        保存中…
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span
        className="text-xs text-danger"
        role="status"
        aria-live="assertive"
        title="点击「保存章节」可重试"
      >
        保存失败 · 点击保存重试
      </span>
    );
  }
  if (status === 'saved' && savedAt) {
    return (
      <span
        className="text-xs text-ok"
        role="status"
        aria-live="polite"
      >
        {mock ? '已保存（占位数据）' : '已保存'} · {savedAt}
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
        {items.map((it, i) => (
          <li key={i} className="rounded-md bg-ink-50 px-2 py-1">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

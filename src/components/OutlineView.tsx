'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  generateOutlineAction,
  saveChapterAction,
  updateChapterOutlineAction,
} from '@/app/actions';
import { formatUserFacingError } from '@/lib/errors';
import { Section, Field, StatusBadge } from '@/components/ui';
import type { ChapterOutline } from '@/types/domain';

type ChapterRow = {
  id: string;
  chapterNumber: number;
  title: string;
  outline: ChapterOutline | null;
  content: string;
  summary: string;
  status: string;
};

export default function OutlineView({
  projectId,
  initialChapters,
  hasBrief,
}: {
  projectId: string;
  initialChapters: ChapterRow[];
  hasBrief: boolean;
}) {
  const router = useRouter();
  const [chapters, setChapters] = useState<ChapterRow[]>(initialChapters);
  const [activeId, setActiveId] = useState<string | null>(initialChapters[0]?.id || null);
  const [totalChapters, setTotalChapters] = useState(8);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const active = chapters.find((c) => c.id === activeId) || null;

  // Keep the local list in sync when the parent re-renders with server data.
  // Intentionally NOT depending on `activeId` here — the effect is only about
  // syncing the chapter list, not about reactively re-setting the active selection.
  useEffect(() => {
    setChapters(initialChapters);
  }, [initialChapters]);
  useEffect(() => {
    if (!activeId || !initialChapters.find((c) => c.id === activeId)) {
      setActiveId(initialChapters[0]?.id || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChapters]);

  function generate() {
    if (!hasBrief) {
      setError('请先在「提示词」页面完成优化并采用结果。');
      return;
    }
    setError(null);
    const willReplace = chapters.length > 0;
    if (willReplace) {
      const ok = window.confirm(
        `当前项目已有 ${chapters.length} 章，重新生成将清空所有已写正文与一致性报告。是否继续？`
      );
      if (!ok) return;
    }
    startTransition(async () => {
      try {
        await generateOutlineAction(projectId, totalChapters, { confirmReplace: willReplace });
        // Re-fetch the canonical chapter list (with real DB IDs) from the server.
        router.refresh();
        flash(willReplace ? '已重新生成大纲' : '已生成大纲');
      } catch (err) {
        setError(formatUserFacingError(err));
      }
    });
  }

  function flash(msg: string) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.className = 'fixed bottom-6 right-6 card px-3 py-2 text-sm z-50';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  function saveOutline(c: ChapterRow, next: ChapterOutline) {
    setChapters((list) =>
      list.map((x) => (x.id === c.id ? { ...x, outline: next } : x))
    );
    startTransition(async () => {
      try {
        await updateChapterOutlineAction(c.id, next);
      } catch (err) {
        setError(formatUserFacingError(err));
      }
    });
  }

  function renameChapter(c: ChapterRow, title: string) {
    setChapters((list) => list.map((x) => (x.id === c.id ? { ...x, title } : x)));
    startTransition(async () => {
      try {
        await saveChapterAction(c.id, { title });
      } catch (err) {
        setError(formatUserFacingError(err));
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      <aside>
        <div className="card p-3">
          <div className="mb-2 flex items-center justify-between px-2 text-xs font-medium uppercase tracking-wider text-ink-500">
            <span>章节大纲</span>
            <span>{chapters.length} 章</span>
          </div>
          {chapters.length === 0 ? (
            <div className="px-2 py-4 text-sm text-ink-500">还没有大纲，先在右侧生成。</div>
          ) : (
            <ul className="space-y-1">
              {chapters.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setActiveId(c.id)}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-ink-100 ${
                      activeId === c.id ? 'bg-ink-100 text-ink-900' : 'text-ink-700'
                    }`}
                    type="button"
                  >
                    <span className="w-6 shrink-0 text-right text-xs text-ink-500">
                      {String(c.chapterNumber).padStart(2, '0')}
                    </span>
                    <span className="line-clamp-1">{c.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="space-y-4">
        <Section
          title="生成大纲"
          description="基于已采用的创作 brief 自动规划章节。重新生成会清空已有章节大纲。"
          right={
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-ink-600">
                章节数
                <input
                  type="number"
                  min={3}
                  max={50}
                  value={totalChapters}
                  onChange={(e) => setTotalChapters(Math.max(3, Math.min(50, Number(e.target.value) || 8)))}
                  className="input w-20"
                />
              </label>
              <button
                className="btn-primary"
                disabled={pending}
                onClick={generate}
                type="button"
              >
                {pending ? '生成中…' : chapters.length > 0 ? '重新生成大纲' : '生成大纲'}
              </button>
            </div>
          }
        >
          {error ? <div className="text-xs text-danger">{error}</div> : null}
          {!hasBrief ? (
            <div className="text-sm text-ink-500">
              尚未采用任何 brief。请先访问「提示词」页面生成并采用优化结果。
            </div>
          ) : (
            <div className="text-sm text-ink-500">准备就绪。</div>
          )}
        </Section>

        {active ? (
          <Section
            title={`第 ${active.chapterNumber} 章 · ${active.title}`}
            description="每个字段都支持独立编辑。保存后会自动参与下一章的生成上下文。"
            right={
              <div className="flex items-center gap-2">
                <input
                  className="input w-64"
                  value={active.title}
                  onChange={(e) => renameChapter(active, e.target.value)}
                />
                <StatusBadge status={active.outline ? 'generated' : 'draft'} />
              </div>
            }
          >
            <OutlineEditor
              outline={active.outline}
              onChange={(next) => saveOutline(active, next)}
            />
            <div className="mt-4 flex justify-end">
              <button
                className="btn"
                onClick={() => router.push(`/projects/${projectId}/chapters/${active.id}`)}
                type="button"
              >
                进入章节编辑器 →
              </button>
            </div>
          </Section>
        ) : (
          <div className="card-soft px-6 py-8 text-center text-sm text-ink-500">
            从左侧选择章节，或先点击「生成大纲」。
          </div>
        )}
      </main>
    </div>
  );
}

function OutlineEditor({
  outline,
  onChange,
}: {
  outline: ChapterOutline | null;
  onChange: (o: ChapterOutline) => void;
}) {
  // Memoize the fallback so a new object isn't allocated on every keystroke
  // (which would also re-allocate every onChange closure and trigger deep
  // re-renders in the parent).
  const o: ChapterOutline = useMemo(
    () =>
      outline ?? {
        goal: '',
        summary: '',
        requiredBeats: [],
        relatedCharacters: [],
        relatedForeshadowing: [],
      },
    [outline]
  );
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="章节目标" hint="本章要解决什么 / 推动什么">
        <textarea
          rows={3}
          className="textarea"
          value={o.goal}
          onChange={(e) => onChange({ ...o, goal: e.target.value })}
        />
      </Field>
      <Field label="章节摘要" hint="2-4 句话概述本章">
        <textarea
          rows={3}
          className="textarea"
          value={o.summary}
          onChange={(e) => onChange({ ...o, summary: e.target.value })}
        />
      </Field>
      <Field label="必备节拍" hint="每行一个，至少 2-3 个">
        <textarea
          rows={4}
          className="textarea"
          value={o.requiredBeats.join('\n')}
          onChange={(e) => onChange({ ...o, requiredBeats: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
        />
      </Field>
      <Field label="关联伏笔" hint="每行一个">
        <textarea
          rows={4}
          className="textarea"
          value={o.relatedForeshadowing.join('\n')}
          onChange={(e) => onChange({ ...o, relatedForeshadowing: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
        />
      </Field>
      <Field label="关联角色" className="md:col-span-2" hint="每行一个，名字需与 Story Bible 一致">
        <textarea
          rows={3}
          className="textarea"
          value={o.relatedCharacters.join('\n')}
          onChange={(e) => onChange({ ...o, relatedCharacters: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
        />
      </Field>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createChapterAction } from '@/app/actions';
import { formatUserFacingError } from '@/lib/errors';
import { Section, StatusBadge } from '@/components/ui';
import type { ChapterOutline } from '@/types/domain';

type Row = {
  id: string;
  chapterNumber: number;
  title: string;
  outline: ChapterOutline | null;
  content: string;
  summary: string;
  status: string;
};

export default function ChapterList({
  projectId,
  initialChapters,
}: {
  projectId: string;
  initialChapters: Row[];
}) {
  const router = useRouter();
  const [chapters, setChapters] = useState<Row[]>(initialChapters);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function addChapter() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set('title', `第 ${chapters.length + 1} 章`);
        const ch = await createChapterAction(projectId, fd);
        setChapters((list) => [
          ...list,
          {
            id: ch.id,
            chapterNumber: ch.chapterNumber,
            title: ch.title,
            outline: null,
            content: '',
            summary: '',
            status: ch.status,
          },
        ]);
        router.push(`/projects/${projectId}/chapters/${ch.id}`);
      } catch (err) {
        setError(formatUserFacingError(err));
      }
    });
  }

  return (
    <Section
      title="章节列表"
      description="从这里进入任一章节开始写作。也可以新建空章节手动撰写。"
      right={
        <button className="btn-primary" onClick={addChapter} disabled={pending}>
          {pending ? '创建中…' : '+ 新建章节'}
        </button>
      }
    >
      {error ? <div className="mb-3 text-xs text-danger">{error}</div> : null}
      {chapters.length === 0 ? (
        <div className="card-soft px-6 py-10 text-center text-sm text-ink-500">
          还没有任何章节。先到「大纲」页生成章节大纲，或直接新建一个空白章节。
        </div>
      ) : (
        <ul className="divide-y divide-ink-200">
          {chapters.map((c) => {
            const wordCount = c.content?.length || 0;
            return (
              <li key={c.id} className="flex items-center gap-4 py-3">
                <span className="w-10 shrink-0 text-right font-mono text-sm text-ink-500">
                  {String(c.chapterNumber).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/projects/${projectId}/chapters/${c.id}`}
                    className="block truncate text-sm font-medium text-ink-900 hover:underline"
                  >
                    {c.title}
                  </Link>
                  <div className="mt-0.5 line-clamp-1 text-xs text-ink-500">
                    {c.outline?.summary || '尚无摘要'}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-ink-500">
                  <span>{wordCount} 字</span>
                  <StatusBadge status={c.status} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

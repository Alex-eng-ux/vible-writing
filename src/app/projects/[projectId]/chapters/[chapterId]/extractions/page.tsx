// Server component: the per-chapter fact-extraction history.
//
// Lists every extraction that has ever been run for this chapter
// (newest first) and shows a one-line preview of each. The "apply" /
// "view" actions live in the client component below; this page is
// read-only and serializes the data needed for the apply button.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getChapterAction,
  getProjectDetailAction,
  listFactExtractionsAction,
} from '@/app/actions';
import ExtractionHistoryView from '@/components/ExtractionHistoryView';
import { safeJsonParse } from '@/lib/json';
import type { FactExtractionPayload } from '@/types/domain';

export const dynamic = 'force-dynamic';

export default async function ExtractionsPage({
  params,
}: {
  params: { projectId: string; chapterId: string };
}) {
  const [detail, chapter, extractions] = await Promise.all([
    getProjectDetailAction(params.projectId),
    getChapterAction(params.chapterId),
    listFactExtractionsAction(params.chapterId),
  ]);
  if (!detail || !chapter) notFound();

  // Hydrate each stored payload to the typed shape and pre-apply the
  // payload → record mapping so the client component can render a
  // ready-to-apply bundle.
  const rows = extractions.map((e) => {
    const payload = safeJsonParse<FactExtractionPayload | null>(e.payload, null);
    return {
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      status: e.status,
      payload,
    };
  });

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="flex items-baseline justify-between">
        <div>
          <Link
            href={`/projects/${params.projectId}/chapters/${params.chapterId}`}
            className="text-xs text-ink-500 hover:text-ink-800"
          >
            ← 返回第 {chapter.chapterNumber} 章「{chapter.title}」
          </Link>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">
            设定提取历史
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            每次对这一章运行「提取设定」，都会留下一条记录。可以重新查看内容，或把记录里的内容再次写回 Story Bible。
          </p>
        </div>
      </header>

      <ExtractionHistoryView
        projectId={params.projectId}
        chapterId={params.chapterId}
        rows={rows}
        existingBible={detail.bible}
      />
    </div>
  );
}

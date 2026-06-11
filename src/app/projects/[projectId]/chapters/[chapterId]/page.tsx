import { notFound } from 'next/navigation';
import { getChapterAction, getProjectDetailAction } from '@/app/actions';
import ChapterEditor from '@/components/ChapterEditor';

export const dynamic = 'force-dynamic';

export default async function ChapterEditorPage({
  params,
}: {
  params: { projectId: string; chapterId: string };
}) {
  const [detail, chapter] = await Promise.all([
    getProjectDetailAction(params.projectId),
    getChapterAction(params.chapterId),
  ]);
  if (!detail || !chapter) notFound();
  return (
    <ChapterEditor
      projectId={params.projectId}
      chapter={chapter}
      projectDetail={{
        brief: detail.project.brief,
        chapters: detail.chapters,
        bible: detail.bible,
      }}
    />
  );
}

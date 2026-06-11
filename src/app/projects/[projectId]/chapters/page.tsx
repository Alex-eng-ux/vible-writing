import { notFound } from 'next/navigation';
import { getProjectDetailAction } from '@/app/actions';
import ChapterList from '@/components/ChapterList';

export const dynamic = 'force-dynamic';

export default async function ChaptersPage({ params }: { params: { projectId: string } }) {
  const detail = await getProjectDetailAction(params.projectId);
  if (!detail) notFound();
  return (
    <ChapterList
      projectId={params.projectId}
      initialChapters={detail.chapters}
    />
  );
}

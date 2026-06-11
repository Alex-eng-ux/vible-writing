import { notFound } from 'next/navigation';
import { getProjectDetailAction } from '@/app/actions';
import StoryBibleView from '@/components/StoryBibleView';

export const dynamic = 'force-dynamic';

export default async function StoryBiblePage({ params }: { params: { projectId: string } }) {
  const detail = await getProjectDetailAction(params.projectId);
  if (!detail) notFound();
  return <StoryBibleView projectId={params.projectId} initialBible={detail.bible} />;
}

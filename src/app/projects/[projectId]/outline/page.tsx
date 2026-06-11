import { notFound } from 'next/navigation';
import { getProjectDetailAction } from '@/app/actions';
import OutlineView from '@/components/OutlineView';

export const dynamic = 'force-dynamic';

export default async function OutlinePage({ params }: { params: { projectId: string } }) {
  const detail = await getProjectDetailAction(params.projectId);
  if (!detail) notFound();
  return <OutlineView projectId={params.projectId} initialChapters={detail.chapters} hasBrief={!!detail.project.brief} />;
}

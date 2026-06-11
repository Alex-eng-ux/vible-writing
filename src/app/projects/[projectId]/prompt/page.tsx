import { notFound } from 'next/navigation';
import { getProjectAction } from '@/app/actions';
import PromptOptimizer from '@/components/PromptOptimizer';

export const dynamic = 'force-dynamic';

export default async function PromptPage({ params }: { params: { projectId: string } }) {
  const project = await getProjectAction(params.projectId);
  if (!project) notFound();
  return (
    <PromptOptimizer
      projectId={params.projectId}
      initialBrief={project.brief}
      rawIdea={project.rawIdea}
    />
  );
}

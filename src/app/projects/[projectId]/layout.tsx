import { notFound } from 'next/navigation';
import { getProjectAction } from '@/app/actions';
import ProjectNav from '@/components/ProjectNav';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  const project = await getProjectAction(params.projectId);
  if (!project) notFound();
  return (
    <div>
      <ProjectNav projectId={params.projectId} projectTitle={project.title} />
      {children}
    </div>
  );
}

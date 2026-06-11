import { notFound } from 'next/navigation';
import { getProjectDetailAction, listConsistencyReportsAction } from '@/app/actions';
import ConsistencyView from '@/components/ConsistencyView';
import { safeJsonParse } from '@/lib/json';
import type { ConsistencyIssue } from '@/types/domain';

export const dynamic = 'force-dynamic';

export default async function ConsistencyPage({ params }: { params: { projectId: string } }) {
  const detail = await getProjectDetailAction(params.projectId);
  if (!detail) notFound();
  const reports = await listConsistencyReportsAction(params.projectId);
  const parsed = reports.map((r) => ({
    ...r,
    issues: safeJsonParse<ConsistencyIssue[]>(r.issues, []),
  }));
  return (
    <ConsistencyView
      projectId={params.projectId}
      chapters={detail.chapters}
      reports={parsed}
    />
  );
}

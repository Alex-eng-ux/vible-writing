'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const TABS: Array<{
  key: string;
  label: string;
  href: (id: string) => string;
  match: (p: string) => boolean;
}> = [
  { key: 'prompt', label: '提示词', href: (id) => `/projects/${id}/prompt`, match: (p) => p.includes('/prompt') },
  { key: 'outline', label: '大纲', href: (id) => `/projects/${id}/outline`, match: (p) => p.includes('/outline') },
  { key: 'bible', label: 'Story Bible', href: (id) => `/projects/${id}/bible`, match: (p) => p.includes('/bible') },
  {
    key: 'chapters',
    label: '章节',
    href: (id) => `/projects/${id}/chapters`,
    match: (p) => p.includes('/chapters') || p.match(/\/projects\/[^/]+$/) !== null,
  },
  {
    key: 'consistency',
    label: '一致性',
    href: (id) => `/projects/${id}/consistency`,
    match: (p) => p.includes('/consistency'),
  },
];

export default function ProjectNav({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const path = usePathname();
  return (
    <div className="mb-6 border-b border-ink-200">
      <div className="flex items-baseline justify-between gap-4 pb-2">
        <div>
          <Link href="/" className="text-xs text-ink-500 hover:text-ink-800">
            {'<-'} 返回作品列表
          </Link>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-ink-900">{projectTitle}</h1>
        </div>
        <Link href="/settings/ai" className="text-xs text-ink-600 underline underline-offset-2 hover:text-ink-900">
          AI 设置
        </Link>
      </div>
      <nav className="-mb-px flex gap-1">
        {TABS.map((t) => {
          const active = t.match(path);
          return (
            <Link key={t.key} href={t.href(projectId)} className={clsx('tab', active && 'tab-active')}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

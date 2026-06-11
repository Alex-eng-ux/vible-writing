'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatUserFacingError } from '@/lib/errors';
import { summarizePayload } from '@/lib/extraction';
import { applyFactsToBibleAction } from '@/app/actions';
import type { FactExtractionPayload, StoryBibleData } from '@/types/domain';

interface Row {
  id: string;
  createdAt: string;
  status: string;
  payload: FactExtractionPayload | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待写入',
  applied: '已写入',
  dismissed: '已忽略',
};

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-ink-100 text-ink-700',
  applied: 'bg-emerald-50 text-emerald-700',
  dismissed: 'bg-ink-50 text-ink-500',
};

export default function ExtractionHistoryView({
  projectId,
  rows,
  existingBible,
}: {
  projectId: string;
  chapterId: string;
  rows: Row[];
  existingBible: StoryBibleData;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="card-soft px-6 py-12 text-center text-sm text-ink-500">
        本章还没有提取记录。回到章节编辑器运行一次「提取设定」即可生成第一条。
      </div>
    );
  }

  function handleApply(row: Row) {
    if (!row.payload) return;
    setError(null);
    setBusyId(row.id);
    startTransition(async () => {
      try {
        // Lazy import to avoid pulling the editor's larger bundle into
        // the page chrome on first render.
        const { payloadToBibleRecords } = await import('@/lib/extraction');
        const records = payloadToBibleRecords(
          row.payload!,
          chapterId,
          existingBible
        );
        await applyFactsToBibleAction(projectId, records, row.id);
        router.refresh();
      } catch (e) {
        setError(formatUserFacingError(e));
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {error}
        </div>
      ) : null}

      {rows.map((row) => {
        const isOpen = expanded === row.id;
        const preview = row.payload ? summarizePayload(row.payload) : null;
        return (
          <article key={row.id} className="card overflow-hidden">
            <header className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span
                className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                  STATUS_TONE[row.status] ?? 'bg-ink-100 text-ink-700'
                }`}
              >
                {STATUS_LABELS[row.status] ?? row.status}
              </span>
              <time
                className="text-sm text-ink-500"
                dateTime={row.createdAt}
                title={row.createdAt}
              >
                {new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false })}
              </time>
              <span className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-800"
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                  aria-expanded={isOpen}
                >
                  {isOpen ? '收起' : '查看内容'}
                </button>
                <button
                  type="button"
                  className="btn-primary text-xs"
                  onClick={() => handleApply(row)}
                  disabled={pending || !row.payload}
                  aria-busy={busyId === row.id}
                >
                  {busyId === row.id ? '正在写入…' : '再次应用到 Bible'}
                </button>
              </span>
            </header>

            {preview ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-ink-100 px-4 py-3 text-xs text-ink-600 sm:grid-cols-2 md:grid-cols-3">
                <Row label="人物" value={preview.characters} />
                <Row label="地点" value={preview.locations} />
                <Row label="物品" value={preview.items} />
                <Row label="世界规则" value={preview.worldRules} />
                <Row label="伏笔" value={preview.foreshadowing} />
                <Row label="事件" value={preview.events} />
                <Row label="状态变化" value={preview.statusChanges} />
              </dl>
            ) : null}

            {isOpen && row.payload ? (
              <pre className="max-h-96 overflow-auto border-t border-ink-100 bg-ink-50 px-4 py-3 text-xs text-ink-700">
                {JSON.stringify(row.payload, null, 2)}
              </pre>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-ink-500">{label}</dt>
      <dd className="truncate text-ink-800" title={value}>
        {value}
      </dd>
    </div>
  );
}

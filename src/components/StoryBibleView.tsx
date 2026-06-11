'use client';

import { memo, useCallback, useMemo, useState, useTransition } from 'react';
import clsx from 'clsx';
import {
  addBibleRecordAction,
  deleteBibleRecordAction,
  updateBibleRecordAction,
} from '@/app/actions';
import { formatUserFacingError } from '@/lib/errors';
import { Field, Section, StatusBadge } from '@/components/ui';
import {
  BIBLE_CATEGORIES,
  BIBLE_CATEGORY_LABELS,
  BIBLE_RECORD_STATUSES,
  type BibleCategory,
  type BibleRecord,
  type StoryBibleData,
} from '@/types/domain';

const STATUS_OPTIONS = BIBLE_RECORD_STATUSES;

function newId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function StoryBibleView({
  projectId,
  initialBible,
}: {
  projectId: string;
  initialBible: StoryBibleData;
}) {
  const [bible, setBible] = useState<StoryBibleData>(initialBible);
  const [active, setActive] = useState<BibleCategory>('characters');
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Stable callbacks keyed on `projectId` + `active` so memoized RecordCard
  // children don't re-render on every form keystroke in the parent.
  const addRecord = useCallback(
    (record: BibleRecord) => {
      setBible((prev) => ({ ...prev, [active]: [...prev[active], record] }));
      startTransition(async () => {
        try {
          await addBibleRecordAction(projectId, active, record);
        } catch (err) {
          // Roll back the optimistic insert so the local view matches the server.
          setBible((prev) => ({
            ...prev,
            [active]: prev[active].filter((r) => r.id !== record.id),
          }));
          setError(formatUserFacingError(err));
        }
      });
    },
    [active, projectId]
  );

  const updateRecord = useCallback(
    (record: BibleRecord) => {
      const prevSnap = bible[active];
      setBible((prev) => ({
        ...prev,
        [active]: prev[active].map((r) => (r.id === record.id ? record : r)),
      }));
      startTransition(async () => {
        try {
          await updateBibleRecordAction(projectId, active, record);
        } catch (err) {
          setBible((prev) => ({ ...prev, [active]: prevSnap }));
          setError(formatUserFacingError(err));
        }
      });
    },
    [active, bible, projectId]
  );

  const deleteRecord = useCallback(
    (id: string) => {
      const prevSnap = bible[active];
      setBible((prev) => ({
        ...prev,
        [active]: prev[active].filter((r) => r.id !== id),
      }));
      startTransition(async () => {
        try {
          await deleteBibleRecordAction(projectId, active, id);
        } catch (err) {
          setBible((prev) => ({ ...prev, [active]: prevSnap }));
          setError(formatUserFacingError(err));
        }
      });
    },
    [active, bible, projectId]
  );

  const records = bible[active];

  const totalCount = useMemo(
    () => BIBLE_CATEGORIES.reduce((acc, c) => acc + bible[c].length, 0),
    [bible]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      <aside>
        <div className="card p-3">
          <div className="px-2 pb-2 text-xs font-medium uppercase tracking-wider text-ink-500">
            Story Bible · {totalCount} 条
          </div>
          <ul className="space-y-1">
            {BIBLE_CATEGORIES.map((c) => {
              const count = bible[c].length;
              return (
                <li key={c}>
                  <button
                    onClick={() => setActive(c)}
                    className={clsx(
                      'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-ink-100',
                      active === c && 'bg-ink-100 text-ink-900 font-medium'
                    )}
                    type="button"
                  >
                    <span>{BIBLE_CATEGORY_LABELS[c].label}</span>
                    <span className="text-xs text-ink-500">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <main>
        {error ? (
          <div
            className="card-soft mb-4 border border-danger/30 px-4 py-2 text-xs text-danger"
            role="alert"
            aria-live="assertive"
          >
            {error}
          </div>
        ) : null}
        <Section
          title={BIBLE_CATEGORY_LABELS[active].label}
          description={BIBLE_CATEGORY_LABELS[active].description}
          right={<AddRecordForm onAdd={addRecord} category={active} />}
        >
          {records.length === 0 ? (
            <div className="card-soft px-6 py-8 text-center text-sm text-ink-500">
              暂无记录。从右上方添加，或在章节中「抽取事实」后一键写入。
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {records.map((r) => (
                <li key={r.id} className="card p-4">
                  <RecordCard record={r} onChange={updateRecord} onDelete={deleteRecord} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </main>
    </div>
  );
}

function AddRecordForm({
  category,
  onAdd,
}: {
  category: BibleCategory;
  onAdd: (r: BibleRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<BibleRecord['status']>('active');

  function submit() {
    if (!name.trim()) return;
    onAdd({
      id: newId(),
      name: name.trim(),
      description: description.trim(),
      status,
      updatedAt: new Date().toISOString(),
    });
    setName('');
    setDescription('');
    setStatus('active');
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)} type="button">
        + 新增记录
      </button>
    );
  }

  return (
    <form
      className="card-soft w-[320px] space-y-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="名称">
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
      </Field>
      <Field label="描述">
        <textarea
          className="textarea"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="状态">
        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value as BibleRecord['status'])}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex justify-end gap-2">
        <button
          className="btn-ghost"
          onClick={() => setOpen(false)}
          type="button"
        >
          取消
        </button>
        <button className="btn-primary" type="submit">
          添加
        </button>
      </div>
    </form>
  );
}

const RecordCard = memo(function RecordCard({
  record,
  onChange,
  onDelete,
}: {
  record: BibleRecord;
  onChange: (r: BibleRecord) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(record);

  if (!editing) {
    return (
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-ink-900">{record.name}</div>
          <StatusBadge status={record.status} />
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">
          {record.description || <span className="text-ink-400">（无描述）</span>}
        </p>
        {record.evidence ? (
          <p className="mt-2 border-l-2 border-ink-200 pl-2 text-xs italic text-ink-500">
            证据：{record.evidence}
          </p>
        ) : null}
        <div className="mt-3 flex justify-end gap-1">
          <button
            className="btn-ghost"
            onClick={() => setEditing(true)}
            type="button"
          >
            编辑
          </button>
          <button
            className="btn-ghost text-danger"
            onClick={() => onDelete(record.id)}
            type="button"
          >
            删除
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        onChange({ ...draft, updatedAt: new Date().toISOString() });
        setEditing(false);
      }}
    >
      <Field label="名称">
        <input
          className="input"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          required
        />
      </Field>
      <Field label="描述">
        <textarea
          className="textarea"
          rows={3}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </Field>
      <Field label="状态">
        <select
          className="input"
          value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value as BibleRecord['status'] })}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex justify-end gap-2">
        <button
          className="btn-ghost"
          onClick={() => setEditing(false)}
          type="button"
        >
          取消
        </button>
        <button className="btn-primary" type="submit">
          保存
        </button>
      </div>
    </form>
  );
});

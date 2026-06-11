import clsx from 'clsx';

export function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: '草稿', cls: 'chip' },
    generated: { label: '已生成', cls: 'chip chip-ok' },
    in_review: { label: '待审阅', cls: 'chip chip-warn' },
    finalized: { label: '已定稿', cls: 'chip chip-active' },
    open: { label: '未处理', cls: 'chip chip-warn' },
    resolved: { label: '已处理', cls: 'chip chip-ok' },
    dismissed: { label: '已忽略', cls: 'chip' },
    active: { label: '活跃', cls: 'chip chip-ok' },
    lost: { label: '遗失', cls: 'chip chip-warn' },
    deceased: { label: '已故', cls: 'chip chip-danger' },
    unknown: { label: '未知', cls: 'chip' },
    pending: { label: '待确认', cls: 'chip chip-warn' },
    applied: { label: '已写入', cls: 'chip chip-ok' },
  };
  const v = map[status || 'draft'] || map.draft;
  return <span className={v.cls}>{v.label}</span>;
}

export function SeverityBadge({ severity }: { severity: 'critical' | 'warning' | 'info' }) {
  if (severity === 'critical') return <span className="chip chip-danger">严重</span>;
  if (severity === 'warning') return <span className="chip chip-warn">警告</span>;
  return <span className="chip">提示</span>;
}

export function Section({
  title,
  description,
  right,
  children,
  className,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('card p-5', className)}>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-ink-500">{description}</p>
          ) : null}
        </div>
        {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card-soft flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="text-sm font-semibold text-ink-700">{title}</div>
      <div className="max-w-md text-sm text-ink-500">{description}</div>
      {action}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-ink-500">{hint}</span> : null}
    </label>
  );
}

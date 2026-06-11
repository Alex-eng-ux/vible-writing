'use client';

import Link from 'next/link';
import { formatUserFacingError } from '@/lib/errors';

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = formatUserFacingError(error);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="text-base font-semibold text-ink-900">出了点问题</div>
      <div
        className="max-w-md text-sm text-ink-600"
        role="alert"
        aria-live="assertive"
      >
        {message}
      </div>
      {error.digest ? (
        <div className="text-xs text-ink-500">错误码：{error.digest}</div>
      ) : null}
      <div className="mt-2 flex items-center gap-3">
        <button className="btn-primary" onClick={reset} type="button">
          重试
        </button>
        <Link
          href="/"
          className="text-sm text-ink-600 underline underline-offset-4 hover:text-ink-900"
        >
          返回项目列表
        </Link>
      </div>
    </div>
  );
}

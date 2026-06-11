'use client';

import { useState, useTransition } from 'react';
import { createProjectAction } from '@/app/actions';
import { Field } from '@/components/ui';

const GENRES = ['现代都市', '悬疑', '科幻', '奇幻', '仙侠', '历史', '都市言情', '其他'];
const LENGTHS = ['短篇 (3-5 万字)', '中篇 (10-15 万字)', '长篇 (30-50 万字)', '超长篇 (50 万字+)'];
const STYLES = ['严肃文学', '类型小说', '轻小说', '硬核悬疑', '史诗', '群像', '心理'];

// In Next.js 14 server actions, `redirect()` throws a NEXT_REDIRECT error whose
// `digest` starts with "NEXT_REDIRECT;". We must let that one bubble out so the
// framework can navigate; treat everything else as a real error.
function isRedirectError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const digest = (err as { digest?: unknown }).digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}

export default function NewProjectForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          try {
            await createProjectAction(fd);
          } catch (err) {
            if (isRedirectError(err)) return;
            setError((err as Error)?.message || '创建失败');
          }
        });
      }}
      className="space-y-4"
    >
      <Field label="原始创意" hint="哪怕是一句话也行，越具体越好。">
        <textarea
          name="rawIdea"
          required
          rows={5}
          className="textarea"
          placeholder="例如：一个失去记忆的调查员，接到一封来自自己的信……"
        />
      </Field>
      <Field label="作品标题（可选）">
        <input name="title" className="input" placeholder="留空可使用「主角名 + 的故事」" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="题材">
          <select name="genre" className="input" defaultValue="">
            <option value="">不限</option>
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="目标篇幅">
          <select name="targetLength" className="input" defaultValue="">
            <option value="">不限</option>
            {LENGTHS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="风格倾向">
          <select name="stylePreference" className="input" defaultValue="">
            <option value="">不限</option>
            {STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error ? <div className="text-xs text-danger">{error}</div> : null}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? '创建中…' : '创建并进入提示词优化'}
      </button>
    </form>
  );
}

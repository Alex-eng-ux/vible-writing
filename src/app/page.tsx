import Link from 'next/link';
import { listProjectsAction } from '@/app/actions';
import NewProjectForm from '@/components/NewProjectForm';
import {
  devSignInAction,
  devSignOutAction,
  productionGuestSignInAction,
} from '@/app/actions/dev-auth';
import { getCurrentUser } from '@/lib/auth';
import { StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    if (process.env.NODE_ENV === 'production') {
      return <ProductionVisitorPrompt />;
    }
    return <DevLoginPrompt />;
  }

  const projects = await listProjectsAction();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="font-serif text-2xl font-semibold text-ink-900">作品工作台</h1>
          <div className="flex items-center gap-3 text-sm text-ink-500">
            <span>
              当前用户：<span className="font-medium text-ink-700">{user.name}</span>
            </span>
            <form action={devSignOutAction}>
              <button
                className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-800"
                type="submit"
              >
                退出
              </button>
            </form>
            <span className="text-ink-300">·</span>
            <span>{projects.length} 个作品</span>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="card-soft flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="font-serif text-lg text-ink-700">还没有作品</div>
            <p className="max-w-md text-sm text-ink-500">
              从一个粗糙的创意开始。系统会先帮你把它优化为完整创作 brief，再生成作品设定、大纲、章节，并自动维护 Story Bible 和一致性检查。
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {projects.map((p) => {
              const updated = new Date(p.updatedAt).toLocaleString('zh-CN', { hour12: false });
              return (
                <li key={p.id} className="card p-4 transition hover:border-ink-400">
                  <Link href={`/projects/${p.id}/prompt`} className="block">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-serif text-lg font-semibold text-ink-900">{p.title}</h3>
                      <StatusBadge status={p.status === 'archived' ? 'dismissed' : 'active'} />
                    </div>
                    <div className="mt-2 line-clamp-3 text-sm text-ink-600">{p.rawIdea}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                      {p.genre ? <span className="chip">{p.genre}</span> : null}
                      {p.targetLength ? <span className="chip">{p.targetLength}</span> : null}
                      {p.stylePreference ? <span className="chip">{p.stylePreference}</span> : null}
                      <span className="ml-auto">
                        {p._count.chapters} 章 · 更新于 {updated}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside>
        <div className="card sticky top-20 p-5">
          <h2 className="font-serif text-lg font-semibold text-ink-900">创建新作品</h2>
          <p className="mt-1 text-sm text-ink-500">
            先输入一段原始创意。下一步会自动进入“提示词优化”页面。
          </p>
          <div className="mt-4">
            <NewProjectForm />
          </div>
        </div>
      </aside>
    </div>
  );
}

function DevLoginPrompt() {
  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="card p-6">
        <h1 className="font-serif text-xl font-semibold text-ink-900">登录</h1>
        <p className="mt-1 text-sm text-ink-500">
          开发环境：输入任意用户名即可登录。生产环境会替换为正式登录入口。
        </p>
        <form action={devSignInAction} className="mt-4 flex flex-col gap-3">
          <label className="text-sm text-ink-700" htmlFor="dev-login-name">
            用户名
          </label>
          <input
            id="dev-login-name"
            name="name"
            type="text"
            required
            minLength={1}
            maxLength={80}
            placeholder="例如：Alice"
            className="rounded border border-ink-300 px-3 py-2 text-sm text-ink-900 focus:border-ink-700 focus:outline-none"
          />
          <button className="btn-primary mt-1" type="submit">
            登录
          </button>
        </form>
      </div>
    </div>
  );
}

function ProductionVisitorPrompt() {
  return (
    <div className="mx-auto mt-16 max-w-2xl">
      <div className="card p-8 text-center">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Vible Writing</h1>
        <p className="mt-3 text-sm leading-7 text-ink-600">
          当前测试服已经部署成功。你可以先接入真实 API，再直接进入工作台创建项目、生成章节和做一致性检查。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/settings/ai" className="btn">
            AI 设置
          </Link>
          <form action={productionGuestSignInAction}>
            <button className="btn-primary" type="submit">
              进入工作台
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

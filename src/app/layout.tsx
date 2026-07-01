import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { getAIConfigSummary } from '@/lib/ai/config';

export const metadata: Metadata = {
  title: 'Vible Writing · AI 小说创作工作台',
  description: 'AI 驱动的长篇小说创作与一致性检查工作台',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const summary = await getAIConfigSummary();
  const mock = !summary.connected;

  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
            <Link href="/" className="flex items-center gap-2 text-ink-900">
              <span className="inline-block h-2 w-2 rounded-full bg-ink-800" />
              <span className="font-serif text-lg font-semibold tracking-wide">Vible Writing</span>
              <span className="hidden text-xs text-ink-500 sm:inline">· 创作工作台</span>
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/settings/ai" className="text-xs text-ink-600 underline underline-offset-2 hover:text-ink-900">
                AI 设置
              </Link>
              {mock ? (
                <span
                  className="chip chip-warn"
                  role="status"
                  aria-label="Mock 模式：未配置真实 AI API，当前功能返回占位数据"
                  title="未配置真实 AI API，当前功能返回 Mock 数据"
                >
                  <span className="status-dot bg-warn" aria-hidden="true" /> Mock 模式
                </span>
              ) : (
                <span
                  className="chip chip-ok"
                  role="status"
                  aria-label="已连接真实 AI API"
                  title={`${summary.displayName} · ${summary.baseUrl}`}
                >
                  <span className="status-dot bg-ok" aria-hidden="true" /> 已连接 API
                </span>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-6 py-6">{children}</main>
      </body>
    </html>
  );
}

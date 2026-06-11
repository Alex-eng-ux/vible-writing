import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { isMockMode } from '@/lib/ai/service';

export const metadata: Metadata = {
  title: 'Vible Writing · AI 小说创作工作台',
  description: 'AI 驱动的长篇小说创作与一致性检查工作台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mock = isMockMode();
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <header className="border-b border-ink-200 bg-white/80 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
            <Link href="/" className="flex items-center gap-2 text-ink-900">
              <span className="inline-block h-2 w-2 rounded-full bg-ink-800" />
              <span className="font-serif text-lg font-semibold tracking-wide">Vible Writing</span>
              <span className="hidden text-xs text-ink-500 sm:inline">· 创作工作台</span>
            </Link>
            <div className="flex items-center gap-3">
              {mock ? (
                <span
                  className="chip chip-warn"
                  role="status"
                  aria-label="Mock 模式：未配置 OPENAI_API_KEY，AI 功能返回占位数据"
                  title="未配置 OPENAI_API_KEY，当前所有 AI 能力返回 Mock 数据"
                >
                  <span className="status-dot bg-warn" aria-hidden="true" /> Mock 模式
                  <span className="sr-only">未配置 OPENAI_API_KEY，AI 功能返回占位数据</span>
                </span>
              ) : (
                <span
                  className="chip chip-ok"
                  role="status"
                  aria-label="已连接 OpenAI 兼容 API"
                  title="已连接 OpenAI-compatible API"
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

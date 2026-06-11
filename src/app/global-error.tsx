'use client';

import { formatUserFacingError } from '@/lib/errors';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = formatUserFacingError(error);
  return (
    <html>
      <body>
        <div
          style={{
            fontFamily: 'system-ui, sans-serif',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '16px', fontWeight: 600 }}>出了点问题</div>
          <div
            role="alert"
            aria-live="assertive"
            style={{ fontSize: '14px', color: '#555', maxWidth: '480px' }}
          >
            {message}
          </div>
          {error.digest ? (
            <div style={{ fontSize: '12px', color: '#888' }}>错误码：{error.digest}</div>
          ) : null}
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button
              onClick={reset}
              style={{
                padding: '8px 16px',
                background: '#222',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              重试
            </button>
            <a
              href="/"
              style={{
                padding: '8px 16px',
                color: '#222',
                textDecoration: 'underline',
                textUnderlineOffset: '4px',
              }}
            >
              返回项目列表
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}

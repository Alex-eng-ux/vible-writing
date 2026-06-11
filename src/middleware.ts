// Next.js middleware — runs on every matched request at the edge.
//
// Currently does ONE thing: rate-limit server-action POSTs against a
// per-IP token bucket. This protects the backend from runaway clients
// (and from a malicious actor hammering the auth helpers we added in
// round 5). It does NOT rate-limit GETs; navigation should be free.
//
// When a real session cookie is wired in we should also fold the user
// id into the bucket key (see `subjectFor` in @/lib/rate-limit).

import { NextRequest, NextResponse } from 'next/server';
import { allow, prune, subjectFor } from '@/lib/rate-limit';

// The default Next.js matcher excludes _next/*, static files, and the
// root favicon; we add the server-action convention by matching the
// `next-action` header presence implicitly via POSTs to non-API paths.
export const config = {
  matcher: [
    // Match POSTs to anything that isn't a static asset. Next.js will
    // hand us the request before it hits the route handler.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

const BUCKET_CONFIG = {
  // 1 token / second, 20 burst -> 60 req/min steady with a 20-request
  // burst on cold start. Generous for an editor; tight enough to catch
  // accidental loops.
  refillPerSecond: 1,
  burst: 20,
};

export function middleware(req: NextRequest) {
  // Only rate-limit server actions (method=POST + has `next-action`
  // header) and explicit /api/ routes. Other methods pass through.
  const isAction = req.method === 'POST' && req.headers.has('next-action');
  const isApi = req.method !== 'GET' && req.headers.get('accept')?.includes('application/json');
  // Cheap detection: actions come through as POSTs without /api/ in
  // the path. We treat those + explicit /api/ as the rate-limited set.
  const shouldRateLimit =
    isAction || (isApi && req.nextUrl.pathname.startsWith('/api/'));

  if (!shouldRateLimit) return NextResponse.next();

  // Prune ~once per request — cheap, and bounds memory.
  prune(BUCKET_CONFIG);

  const subject = subjectFor(req);
  const decision = allow(subject, BUCKET_CONFIG);

  if (decision.ok) {
    const res = NextResponse.next();
    res.headers.set('X-RateLimit-Remaining', String(decision.remaining));
    return res;
  }

  // 429 Too Many Requests
  return new NextResponse(
    JSON.stringify({
      error: 'rate_limited',
      retryAfterMs: decision.retryAfterMs,
      message: '请求过于频繁，请稍后重试。',
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(Math.ceil(decision.retryAfterMs / 1000)),
        'X-RateLimit-Remaining': '0',
      },
    }
  );
}

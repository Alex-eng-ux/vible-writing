// Typed application errors.
//
// Why this file exists:
//   - The codebase used to `throw new Error(...)` everywhere, which made it
//     impossible to tell at the UI layer whether the user did something wrong
//     (e.g. pasted a bad URL) or whether the database / LLM blew up.
//   - Next.js Server Actions only forward `Error.message` and `Error.digest`
//     to the client. Custom properties (kind/code) are stripped. So the
//     distinction between "user-facing" and "infrastructure" must live in
//     the *message* itself plus the *server-side logging*.
//
// Two classes, two rules:
//   1. `UserError` — the user did something recoverable. `message` is the
//      user-facing text. The client renders it verbatim.
//   2. `InfraError` — the database, network, or LLM failed. `message` is the
//      short, friendly version the user sees. `devMessage` and `cause` are
//      logged on the server only.
//
// Helper `withErrorLogging` is the single place where InfraError details are
// written to the server console. Actions that throw InfraError should be
// either (a) wrapped in `withErrorLogging` or (b) re-thrown from a try/catch
// that calls `logInfraError` once.

export type AppErrorKind = 'user' | 'infra';

export class UserError extends Error {
  readonly kind: AppErrorKind = 'user';
  readonly code: string;

  constructor(message: string, code: string = 'user_error') {
    super(message);
    this.name = 'UserError';
    this.code = code;
  }
}

export class InfraError extends Error {
  readonly kind: AppErrorKind = 'infra';
  readonly code: string;
  /** Long, developer-facing description. Logged on the server, never sent to the client. */
  readonly devMessage: string;
  /** Optional original cause (e.g. a Prisma/network error). Logged on the server. */
  readonly cause?: unknown;

  constructor(
    devMessage: string,
    userMessage: string = '系统暂时无法处理请求，请稍后重试。',
    code: string = 'infra_error',
    cause?: unknown
  ) {
    super(userMessage);
    this.name = 'InfraError';
    this.code = code;
    this.devMessage = devMessage;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

// ---- Predicates ------------------------------------------------------------

export function isUserError(e: unknown): e is UserError {
  return e instanceof UserError;
}

export function isInfraError(e: unknown): e is InfraError {
  return e instanceof InfraError;
}

export function isAppError(e: unknown): e is UserError | InfraError {
  return isUserError(e) || isInfraError(e);
}

// ---- Server-side logging ---------------------------------------------------

/**
 * Log a typed or unknown error on the server. Safe to call from any action
 * or service layer. Never throws.
 */
export function logError(actionName: string, e: unknown): void {
  if (isInfraError(e)) {
    // eslint-disable-next-line no-console
    console.error(
      `[${actionName}] InfraError[${e.code}]: ${e.devMessage}`,
      e.cause !== undefined ? { cause: e.cause } : undefined
    );
    return;
  }
  if (isUserError(e)) {
    // UserError is expected — debug-level only, no stack spam.
    // eslint-disable-next-line no-console
    console.warn(`[${actionName}] UserError[${e.code}]: ${e.message}`);
    return;
  }
  // Unknown error — treat as infra. Print full stack for post-mortem.
  // eslint-disable-next-line no-console
  console.error(`[${actionName}] UntypedError:`, e);
}

// ---- Client-side rendering helper -----------------------------------------

/**
 * Pick the user-facing message to display in a React error boundary.
 * For non-typed errors (e.g. network failures on the client itself) we fall
 * back to the generic infra message.
 */
export function formatUserFacingError(e: unknown, fallback = '出了点问题，请稍后再试。'): string {
  if (isUserError(e)) return e.message;
  if (isInfraError(e)) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/**
 * A small local error log.
 *
 * There is no error-reporting backend, so when something breaks for a player
 * the only evidence is whatever the page kept. This records the last handful of
 * errors to localStorage, where the in-app diagnostics can show them and the
 * player can copy them out.
 *
 * Deliberately self-contained: no network, no third-party SDK, nothing to
 * configure. Swapping in a hosted reporter later means calling it from
 * `recordError` and leaving every call site alone.
 */

const ERROR_LOG_KEY = 'arithmatrix_error_log';

/** Enough to see a pattern, small enough to never crowd out saved games. */
const MAX_ENTRIES = 20;

export type LoggedError = {
  at: string;
  message: string;
  stack?: string;
  /** Where it came from - a boundary, a global handler, a named operation. */
  context?: string;
  url: string;
};

const describe = (error: unknown): { message: string; stack?: string } => {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack };
  }
  try {
    return { message: String(error) };
  } catch {
    return { message: 'Unserializable error' };
  }
};

export const readErrorLog = (): LoggedError[] => {
  try {
    const stored = localStorage.getItem(ERROR_LOG_KEY);
    return stored ? (JSON.parse(stored) as LoggedError[]) : [];
  } catch {
    return [];
  }
};

/** Records an error, newest first. Never throws - it is called from error paths. */
export const recordError = (error: unknown, context?: string): void => {
  try {
    const { message, stack } = describe(error);
    const entry: LoggedError = {
      at: new Date().toISOString(),
      message,
      // Trimmed: a full React stack can run to several KB
      stack: stack?.split('\n').slice(0, 8).join('\n'),
      context,
      url: window.location.pathname + window.location.search,
    };
    const next = [entry, ...readErrorLog()].slice(0, MAX_ENTRIES);
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked - losing the log is not worth a second failure
  }
};

export const clearErrorLog = (): void => {
  try {
    localStorage.removeItem(ERROR_LOG_KEY);
  } catch {
    // Nothing useful to do
  }
};

/**
 * Catches what React's error boundary cannot: errors thrown outside rendering,
 * and rejected promises with no handler.
 */
export const installGlobalErrorHandlers = (): void => {
  window.addEventListener('error', event => {
    recordError(event.error ?? event.message, 'window.onerror');
  });
  window.addEventListener('unhandledrejection', event => {
    recordError(event.reason, 'unhandledrejection');
  });
};

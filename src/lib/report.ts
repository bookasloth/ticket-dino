import * as Sentry from '@sentry/nextjs';

export function report(error: unknown, context?: Record<string, unknown>) {
  console.error(error, context);
  Sentry.captureException(error, { extra: context });
}

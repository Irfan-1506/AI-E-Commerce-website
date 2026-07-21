import * as Sentry from '@sentry/nextjs';

// Previously the frontend had zero error visibility — a crash or broken
// flow in a customer's browser was invisible unless they reported it
// manually. This closes that gap the same way the backend already had it
// covered (Sentry on 5xx since Phase 2).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0, // no session replay by default — that's a real privacy decision (records user screens), opt in explicitly if wanted
  replaysOnErrorSampleRate: 0,
});

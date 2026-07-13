/**
 * Next.js instrumentation — validate environment before serving requests.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV === 'test') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { validateEnvOnStartup } = await import('@/lib/validation/env');
  validateEnvOnStartup();
}

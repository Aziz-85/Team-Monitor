import { NextResponse } from 'next/server';
import { APP_VERSION, GIT_HASH, BUILD_DATE, getEnvironment } from '@/lib/version';
import { getBuildId } from '@/lib/server/getBuildId';

export const dynamic = 'force-dynamic';

/** Public: returns build metadata. No secrets. buildId from .next/BUILD_ID when present. */
export async function GET() {
  const buildId = getBuildId();
  return NextResponse.json({
    appVersion: APP_VERSION,
    gitSha: GIT_HASH,
    gitHash: GIT_HASH,
    buildId: buildId || undefined,
    buildDate: BUILD_DATE,
    environment: getEnvironment(),
  });
}

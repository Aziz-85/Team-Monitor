/**
 * Build stamp / health – read-only, no DB.
 * Returns commit and buildTime so deployments can confirm which build is live.
 * Set BUILD_COMMIT and BUILD_TIME (or BUILD_TIMESTAMP) when starting the app.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const commit = process.env.BUILD_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown';
  const buildTime =
    process.env.BUILD_TIME ?? process.env.BUILD_TIMESTAMP ?? process.env.VERCEL_BUILD_CREATED_AT ?? 'unknown';
  return NextResponse.json({ commit, buildTime });
}

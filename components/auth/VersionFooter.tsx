import { APP_VERSION, GIT_HASH, getEnvironment } from '@/lib/version';
import { getBuildId } from '@/lib/server/getBuildId';

/** Build metadata for authenticated shell only — not shown on login. */
export function VersionFooter() {
  const buildId = getBuildId();
  const env = getEnvironment();
  const versionLine = GIT_HASH
    ? `Server: v${APP_VERSION} (${GIT_HASH})`
    : `Server: v${APP_VERSION}`;

  return (
    <footer
      className="shrink-0 border-t border-border/40 py-2 text-center text-xs text-muted"
      dir="ltr"
    >
      {versionLine}
      {env !== 'production' ? <span className="mt-0.5 block capitalize">Env: {env}</span> : null}
      {buildId ? <span className="mt-0.5 block">Build: {buildId}</span> : null}
    </footer>
  );
}

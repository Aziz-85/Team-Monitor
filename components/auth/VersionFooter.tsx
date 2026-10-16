import { APP_VERSION, GIT_HASH, getEnvironment } from '@/lib/version';
import { getBuildId } from '@/lib/server/getBuildId';

/** Build metadata for authenticated shell only — not shown on login. */
export function VersionFooter() {
  const buildId = getBuildId();
  const env = getEnvironment();
  const versionLine = GIT_HASH ? `v${APP_VERSION} · ${GIT_HASH}` : `v${APP_VERSION}`;
  const technicalDetails = [
    `Team Monitor ${versionLine}`,
    env !== 'production' ? `Environment: ${env}` : null,
    buildId ? `Build: ${buildId}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <footer
      className="shrink-0 border-t border-border/30 px-4 py-2 text-center text-[11px] text-muted/75"
      dir="ltr"
      title={technicalDetails}
    >
      <span className="font-medium">Team Monitor</span>
      <span aria-hidden="true"> · </span>
      <span>{versionLine}</span>
      {env !== 'production' ? <span className="ms-1 rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold uppercase text-amber-800">{env}</span> : null}
    </footer>
  );
}

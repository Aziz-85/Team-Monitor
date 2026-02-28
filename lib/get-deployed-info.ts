import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const DEFAULT_DEPLOY_STATE_DIR = '/home/deploy/.deploy';

export type DeployedInfo = {
  packageVersion: string;
  gitShaShort: string;
  deployedAt: string | null;
};

function getFallbackInfo(): DeployedInfo {
  const root = process.cwd();
  let packageVersion = '0.0.0';
  let gitShaShort = '';
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    packageVersion = pkg?.version ?? '0.0.0';
  } catch {
    // keep default
  }
  try {
    gitShaShort = execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: root }).trim();
  } catch {
    // not in git or git unavailable
  }
  return { packageVersion, gitShaShort, deployedAt: null };
}

export function getDeployedInfo(): DeployedInfo {
  try {
    const deployStateDir = process.env.DEPLOY_STATE_DIR ?? DEFAULT_DEPLOY_STATE_DIR;
    const p = join(deployStateDir, 'team-monitor_current.json');
    if (existsSync(p)) {
      const data = JSON.parse(readFileSync(p, 'utf8'));
      const packageVersion = data?.packageVersion ?? '0.0.0';
      const gitShaShort = data?.gitShaShort ?? '';
      const deployedAt = data?.deployedAt ?? null;
      return { packageVersion, gitShaShort, deployedAt };
    }
  } catch {
    // fall through to fallback
  }
  return getFallbackInfo();
}

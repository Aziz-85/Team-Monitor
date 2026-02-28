#!/usr/bin/env node
/**
 * Writes FINAL_VERSION = "<packageVersion>+<shortSha>" to repo root VERSION.
 * Exits non-zero if package.json or git SHA cannot be read.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const root = join(process.cwd());
const pkgPath = join(root, 'package.json');
const versionPath = join(root, 'VERSION');

let packageVersion;
try {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  packageVersion = pkg?.version;
  if (!packageVersion || typeof packageVersion !== 'string') {
    console.error('ERROR: package.json missing or invalid version');
    process.exit(1);
  }
} catch (e) {
  console.error('ERROR: Cannot read package.json:', e.message);
  process.exit(1);
}

let sha;
try {
  sha = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8', cwd: root }).trim();
  if (!sha) throw new Error('empty SHA');
} catch (e) {
  console.error('ERROR: Cannot get git short SHA:', e.message);
  process.exit(1);
}

const FINAL_VERSION = `${packageVersion}+${sha}`;
writeFileSync(versionPath, FINAL_VERSION + '\n', 'utf8');
console.log(FINAL_VERSION);

/**
 * Filesystem storage for historical snapshots.
 * Path: /data/historical-snapshots/{boutiqueId}/{YYYY-MM}.json
 * Atomic write: temp file then rename.
 */

import { writeFile, readFile, mkdir, rename } from 'fs/promises';
import path from 'path';
import type { HistoricalSnapshot } from './types';

const DATA_DIR = 'data';
const SNAPSHOTS_DIR = 'historical-snapshots';

function getBaseDir(): string {
  return path.join(process.cwd(), DATA_DIR, SNAPSHOTS_DIR);
}

export function getSnapshotDir(boutiqueId: string): string {
  return path.join(getBaseDir(), boutiqueId);
}

export function getSnapshotPath(boutiqueId: string, month: string): string {
  const sanitized = month.replace(/[^0-9-]/g, '').slice(0, 7);
  return path.join(getSnapshotDir(boutiqueId), `${sanitized}.json`);
}

/** Ensure directory exists (recursive). */
export async function ensureSnapshotDir(boutiqueId: string): Promise<void> {
  const dir = getSnapshotDir(boutiqueId);
  await mkdir(dir, { recursive: true });
}

/** Write snapshot atomically (temp file then rename). */
export async function writeSnapshot(snapshot: HistoricalSnapshot): Promise<void> {
  const dir = getSnapshotDir(snapshot.boutiqueId);
  await mkdir(dir, { recursive: true });
  const targetPath = getSnapshotPath(snapshot.boutiqueId, snapshot.month);
  const tempPath = `${targetPath}.${Date.now()}.tmp`;
  const body = JSON.stringify(snapshot, null, 0);
  await writeFile(tempPath, body, 'utf8');
  await rename(tempPath, targetPath);
}

/** Read snapshot; returns null if file missing. */
export async function readSnapshot(
  boutiqueId: string,
  month: string
): Promise<HistoricalSnapshot | null> {
  const filePath = getSnapshotPath(boutiqueId, month);
  try {
    const raw = await readFile(filePath, 'utf8');
    const data = JSON.parse(raw) as HistoricalSnapshot;
    if (!data.month || !data.boutiqueId || !Array.isArray(data.daily) || !data.totals) {
      return null;
    }
    return data;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') return null;
    throw e;
  }
}

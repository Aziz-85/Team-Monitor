import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const DB_NAME = 'dhahran_offline.db';

let db: SQLiteDatabase | null = null;

/**
 * Initialize SQLite and create tables. Call once at app startup.
 * Tables: tasks, schedule, targets, outbox (pending actions).
 */
export async function initDb(): Promise<SQLiteDatabase> {
  if (db) return db;
  db = await openDatabaseAsync(DB_NAME);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      due_date TEXT,
      completed INTEGER DEFAULT 0,
      synced INTEGER DEFAULT 0,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS schedule (
      id TEXT PRIMARY KEY NOT NULL,
      date TEXT NOT NULL,
      emp_id TEXT,
      data TEXT,
      synced INTEGER DEFAULT 0,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS targets (
      id TEXT PRIMARY KEY NOT NULL,
      period TEXT NOT NULL,
      value REAL,
      synced INTEGER DEFAULT 0,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY NOT NULL,
      action TEXT NOT NULL,
      payload TEXT,
      created_at TEXT,
      retry_count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS manager_dashboard_snapshot (
      key TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS team_snapshots (
      key TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  return db;
}

/**
 * Get the opened database. Must call initDb() first.
 */
export function getDb(): SQLiteDatabase | null {
  return db;
}

/**
 * Tasks helpers (scaffolding only; no full sync).
 */
export async function getDbTasks(): Promise<unknown[]> {
  const database = getDb();
  if (!database) return [];
  const result = await database.getAllAsync<unknown>('SELECT * FROM tasks ORDER BY due_date', []);
  return result ?? [];
}

export async function insertDbTask(row: {
  id: string;
  title: string;
  body?: string;
  due_date?: string;
}): Promise<void> {
  const database = getDb();
  if (!database) return;
  await database.runAsync(
    'INSERT OR REPLACE INTO tasks (id, title, body, due_date, updated_at) VALUES (?, ?, ?, ?, ?)',
    [row.id, row.title, row.body ?? null, row.due_date ?? null, new Date().toISOString()]
  );
}

/**
 * Schedule helpers (scaffolding only).
 */
export async function getDbSchedule(): Promise<unknown[]> {
  const database = getDb();
  if (!database) return [];
  const result = await database.getAllAsync<unknown>('SELECT * FROM schedule ORDER BY date', []);
  return result ?? [];
}

/**
 * Targets helpers (scaffolding only).
 */
export async function getDbTargets(): Promise<unknown[]> {
  const database = getDb();
  if (!database) return [];
  const result = await database.getAllAsync<unknown>('SELECT * FROM targets', []);
  return result ?? [];
}

/**
 * Outbox helpers (pending actions for later sync).
 */
export async function addOutboxEntry(action: string, payload: string): Promise<void> {
  const database = getDb();
  if (!database) return;
  const id = `outbox_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await database.runAsync(
    'INSERT INTO outbox (id, action, payload, created_at, retry_count) VALUES (?, ?, ?, ?, 0)',
    [id, action, payload, new Date().toISOString()]
  );
}

export async function getOutboxEntries(): Promise<unknown[]> {
  const database = getDb();
  if (!database) return [];
  const result = await database.getAllAsync<unknown>('SELECT * FROM outbox ORDER BY created_at', []);
  return result ?? [];
}

const MANAGER_DASHBOARD_KEY = 'latest';

/** Save last manager dashboard response for offline fallback. */
export async function saveManagerDashboardSnapshot(data: string): Promise<void> {
  const database = getDb();
  if (!database) return;
  await database.runAsync(
    'INSERT OR REPLACE INTO manager_dashboard_snapshot (key, data, updated_at) VALUES (?, ?, ?)',
    [MANAGER_DASHBOARD_KEY, data, new Date().toISOString()]
  );
}

/** Get last saved manager dashboard snapshot, if any. */
export async function getManagerDashboardSnapshot(): Promise<string | null> {
  const database = getDb();
  if (!database) return null;
  const row = await database.getFirstAsync<{ data: string }>(
    'SELECT data FROM manager_dashboard_snapshot WHERE key = ?',
    [MANAGER_DASHBOARD_KEY]
  );
  return row?.data ?? null;
}

const TEAM_SNAPSHOT_KEY = 'latest';

/** Save last team today response for offline fallback. */
export async function saveTeamSnapshot(data: string): Promise<void> {
  const database = getDb();
  if (!database) return;
  await database.runAsync(
    'INSERT OR REPLACE INTO team_snapshots (key, data, updated_at) VALUES (?, ?, ?)',
    [TEAM_SNAPSHOT_KEY, data, new Date().toISOString()]
  );
}

/** Get last saved team snapshot, if any. */
export async function getTeamSnapshot(): Promise<string | null> {
  const database = getDb();
  if (!database) return null;
  const row = await database.getFirstAsync<{ data: string }>(
    'SELECT data FROM team_snapshots WHERE key = ?',
    [TEAM_SNAPSHOT_KEY]
  );
  return row?.data ?? null;
}

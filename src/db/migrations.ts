import path from "node:path";
import { readdir, readFile } from "node:fs/promises";

import type { Pool, PoolClient } from "pg";

export interface MigrationStatus {
  pending: string[];
  applied: string[];
}

export async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getMigrationStatus(pool: Pool): Promise<MigrationStatus> {
  await ensureMigrationsTable(pool);
  const all = await readMigrationFiles();
  const appliedRows = await pool.query<{ name: string }>("SELECT name FROM _migrations ORDER BY name");
  const applied = appliedRows.rows.map((row: { name: string }) => row.name);
  const pending = all.filter((name) => !applied.includes(name));

  return { pending, applied };
}

export async function runMigrations(pool: Pool, dryRun = false): Promise<string[]> {
  const status = await getMigrationStatus(pool);
  if (dryRun || status.pending.length === 0) {
    return status.pending;
  }

  for (const name of status.pending) {
    const sql = await readMigrationSql(name);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return status.pending;
}

async function readMigrationFiles(): Promise<string[]> {
  const migrationsDir = path.resolve(process.cwd(), "src/db/migrations/sql");
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function readMigrationSql(name: string): Promise<string> {
  const targetPath = path.resolve(process.cwd(), "src/db/migrations/sql", name);
  return readFile(targetPath, "utf8");
}

export async function withTransaction<T>(
  pool: Pool,
  handler: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

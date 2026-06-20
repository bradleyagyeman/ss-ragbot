import { Pool } from "pg";

import type { AppConfig } from "../types/index.js";

type PoolKind = "app" | "migrator";

const cachedPools = new Map<PoolKind, Pool>();

export function getPool(config: AppConfig, kind: PoolKind = "app"): Pool {
  const cached = cachedPools.get(kind);
  if (cached) {
    return cached;
  }

  const pool = new Pool({
    connectionString: kind === "app" ? config.dbUrl : config.migratorDbUrl,
  });
  cachedPools.set(kind, pool);
  return pool;
}

export async function closePool(): Promise<void> {
  for (const pool of cachedPools.values()) {
    await pool.end();
  }
  cachedPools.clear();
}

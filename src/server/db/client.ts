import "server-only";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** Creates an embedded Postgres (PGlite) database and applies migrations. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const client = new PGlite(dataDir);
  const db = drizzlePglite({ client, schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Db;
}

function createPostgresDb(url: string): Db {
  const client = postgres(url, { max: 5, prepare: false });
  return drizzlePostgres({ client, schema }) as unknown as Db;
}

type GlobalWithDb = typeof globalThis & { __openmetricsDb?: Promise<Db> };
const g = globalThis as GlobalWithDb;

async function init(): Promise<Db> {
  const { DATABASE_URL, PGLITE_DATA_DIR, DEMO_MODE } = env();
  const db = DATABASE_URL ? createPostgresDb(DATABASE_URL) : await createPgliteDb(PGLITE_DATA_DIR);
  const { ensureBootstrap } = await import("./bootstrap");
  await ensureBootstrap(db, { demo: DEMO_MODE === "true" });
  return db;
}

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function getDb(): Promise<Db> {
  if (!g.__openmetricsDb) {
    g.__openmetricsDb = init().catch((error) => {
      g.__openmetricsDb = undefined;
      throw error;
    });
  }
  return g.__openmetricsDb;
}

export function setDbForTests(db: Db | undefined): void {
  g.__openmetricsDb = db ? Promise.resolve(db) : undefined;
}

export { schema };

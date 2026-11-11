import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleLite } from "drizzle-orm/pglite";
import { readFile, readdir, mkdir } from "node:fs/promises";
import * as schema from "./schema.js";
import { acquireDataLock } from "./data-lock.js";
export interface Sql {
  query<T = Record<string, any>>(
    sql: string,
    params?: any[],
  ): Promise<{ rows: T[] }>;
}
await mkdir(".data", { recursive: true });
export const dataDirectory = process.env.PGLITE_DATA_DIR ?? ".data/postgres";
const releaseDataLock =
  !process.env.DATABASE_URL && process.env.TEST_DB !== "memory"
    ? await acquireDataLock(dataDirectory)
    : null;
export const embedded = process.env.DATABASE_URL
  ? null
  : new PGlite(process.env.TEST_DB === "memory" ? "memory://" : dataDirectory);
export const pool = embedded
  ? null
  : new Pool({ connectionString: process.env.DATABASE_URL });
export const sql: Sql = (embedded ?? pool)!;
export const authDb = embedded
  ? drizzleLite(embedded, { schema })
  : drizzlePg(pool!, { schema });
let queue = Promise.resolve();
export async function transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  if (embedded) {
    const prev = queue;
    let release!: () => void;
    queue = new Promise((r) => (release = r));
    await prev;
    try {
      return await embedded.transaction((tx) => fn(tx));
    } finally {
      release();
    }
  }
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function migrate() {
  if (
    !(await sql.query("SELECT to_regclass('public.migrations') AS name"))
      .rows[0].name
  )
    await sql.query(
      "CREATE TABLE migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
    );
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (
      (await sql.query("SELECT name FROM migrations WHERE name=$1", [name]))
        .rows.length
    )
      continue;
    await transaction(async (tx) => {
      const body = await readFile(`migrations/${name}`, "utf8");
      if (embedded) await (tx as any).exec(body);
      else await tx.query(body);
      await tx.query("INSERT INTO migrations(name) VALUES($1)", [name]);
    });
  }
}
export async function closeDb() {
  if (embedded) await embedded.close();
  else await pool!.end();
  await releaseDataLock?.();
}

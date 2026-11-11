import { PGlite } from "@electric-sql/pglite";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { acquireDataLock } from "../server/data-lock.ts";
if (process.env.DATABASE_URL)
  throw new Error(
    "Para PostgreSQL externo, use pg_dump conforme docs/OPERACAO.md.",
  );
// Execute com o aplicativo parado; uma instância PGlite por diretório.
const dataDirectory = process.env.PGLITE_DATA_DIR ?? ".data/postgres";
const release = await acquireDataLock(dataDirectory);
const db = new PGlite(dataDirectory);
await db.waitReady;
await mkdir(".data/backups", { recursive: true });
const file = path.resolve(
  `.data/backups/impulsa-${new Date().toISOString().replace(/[:.]/g, "-")}.tar.gz`,
);
const blob = await db.dumpDataDir("gzip");
await writeFile(file, Buffer.from(await blob.arrayBuffer()), { mode: 0o600 });
await db.close();
await release();
console.log(`Backup local criado: ${file}`);

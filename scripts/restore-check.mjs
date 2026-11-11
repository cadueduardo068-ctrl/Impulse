// Restore into a new directory only; never overwrite or move the live database.
import { PGlite } from "@electric-sql/pglite";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { acquireDataLock } from "../server/data-lock.ts";
const archive = process.argv[2];
if (!archive)
  throw new Error(
    "Informe o caminho do backup .tar.gz criado por scripts/backup.mjs.",
  );
const root = path.resolve(".data/restores"),
  target = path.resolve(root, randomUUID());
if (!target.startsWith(root + path.sep))
  throw new Error("Destino fora da pasta de restauração.");
await mkdir(target, { recursive: true });
const release = await acquireDataLock(target);
let db;
try {
  db = await PGlite.create({
    dataDir: target,
    loadDataDir: new Blob([await readFile(path.resolve(archive))]),
  });
  const counts = {
    companies: Number(
      (await db.query("SELECT count(*) AS n FROM companies")).rows[0].n,
    ),
    users: Number(
      (await db.query('SELECT count(*) AS n FROM "user"')).rows[0].n,
    ),
    records: Number(
      (await db.query("SELECT count(*) AS n FROM records")).rows[0].n,
    ),
    quotes: Number(
      (await db.query("SELECT count(*) AS n FROM quotes")).rows[0].n,
    ),
  };
  const result = {
    checkedAt: new Date().toISOString(),
    directory: target,
    counts,
    verification:
      "Arquivo restaurado em diretório separado e consultas realizadas; não substituiu o banco em uso.",
  };
  await writeFile(
    path.join(target, "restore-check.json"),
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result));
} finally {
  await db?.close();
  await release();
}

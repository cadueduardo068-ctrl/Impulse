import { PGlite } from "@electric-sql/pglite";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
const [source, target] = process.argv.slice(2);
if (!source || !target)
  throw new Error(
    "Uso: node scripts/restore.mjs arquivo.tar.gz .data/postgres-restaurado",
  );
const root = path.resolve(".data") + path.sep;
const dest = path.resolve(target);
if (!dest.startsWith(root) || dest === path.resolve(".data/postgres"))
  throw new Error(
    "Restaure em um diretório novo dentro de .data. O banco atual não é sobrescrito.",
  );
let exists = true;
try {
  await access(dest);
} catch {
  exists = false;
}
if (exists) throw new Error("Diretório de destino já existe");
const db = new PGlite({
  dataDir: dest,
  loadDataDir: new Blob([await readFile(source)]),
});
await db.waitReady;
const r = await db.query("SELECT count(*) AS empresas FROM companies");
await db.close();
console.log(
  `Restauração verificada em ${dest}; empresas: ${r.rows[0].empresas}. Defina PGLITE_DATA_DIR para usar esta cópia.`,
);

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
// Execute com node --env-file-if-exists=.env scripts/stop.mjs.
const directory = process.env.PGLITE_DATA_DIR ?? ".data/postgres";
const lock = JSON.parse(
  await readFile(path.join(directory, ".impulsa.lock"), "utf8"),
);
await writeFile(path.join(directory, ".impulsa-stop"), String(lock.pid));
console.log(
  "Solicitação de encerramento gracioso enviada ao processo " + lock.pid,
);

import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
export async function acquireDataLock(directory: string) {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, ".impulsa.lock");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(file, "wx");
      await handle.writeFile(
        JSON.stringify({
          pid: process.pid,
          startedAt: new Date().toISOString(),
        }),
      );
      await handle.close();
      let released = false;
      const release = async () => {
        if (released) return;
        released = true;
        try {
          const value = JSON.parse(await readFile(file, "utf8"));
          if (value.pid === process.pid) await unlink(file);
        } catch {
          /* já removido */
        }
      };
      process.once("exit", () => {
        try {
          if (
            !released &&
            existsSync(file) &&
            JSON.parse(requireRead(file, "utf8")).pid === process.pid
          )
            unlinkSync(file);
        } catch {
          /* verificação principal é o PID ao iniciar */
        }
      });
      return release;
    } catch (e: any) {
      if (e.code !== "EEXIST") throw e;
      let pid: number;
      try {
        pid = JSON.parse(await readFile(file, "utf8")).pid;
      } catch {
        throw new Error(
          "O banco possui um bloqueio de processo inválido. Não abra outra instância antes de verificar .impulsa.lock.",
        );
      }
      let live = true;
      try {
        process.kill(pid, 0);
      } catch (e: any) {
        if (e.code === "ESRCH") live = false;
      }
      if (live)
        throw new Error(
          `O banco local já está em uso pelo processo ${pid}. Use node scripts/stop.mjs para parar corretamente; não abra outra instância.`,
          { cause: e },
        );
      await unlink(file);
    }
  }
  throw new Error("Não foi possível obter exclusividade no banco local");
}
import { readFileSync as requireRead } from "node:fs";

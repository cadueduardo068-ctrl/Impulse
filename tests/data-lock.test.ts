import { it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { acquireDataLock } from "../server/data-lock";
it("impede duas instâncias no mesmo diretório e libera exclusividade após fechar", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "impulsa-lock-test-"));
  if (
    !path
      .resolve(directory)
      .startsWith(path.resolve(tmpdir(), "impulsa-lock-test-"))
  )
    throw new Error("Diretório temporário fora do prefixo autorizado");
  try {
    const release = await acquireDataLock(directory);
    await expect(acquireDataLock(directory)).rejects.toThrow("já está em uso");
    await release();
    const releaseAgain = await acquireDataLock(directory);
    await releaseAgain();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

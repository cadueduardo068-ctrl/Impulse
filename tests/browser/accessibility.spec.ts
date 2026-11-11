import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("teclado, nomes acessíveis e contraste das telas principais", async ({
  page,
}) => {
  await page.goto("/cadastro");
  await page.getByRole("button", { name: "Rejeitar opcionais" }).click();
  let result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.goto("/demonstracao");
  await expect(
    page.getByRole("heading", { name: "Seu negócio começa aqui." }),
  ).toBeVisible();
  result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => document.activeElement !== document.body),
  ).toBe(true);
});
test("preferência do dispositivo, persistência e diálogo no tema escuro", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Rejeitar opcionais" }).click();
  await page.getByRole("button", { name: "Ativar tema claro" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Ativar tema escuro" }).click();
  await page.goto("/demonstracao");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const audit = async () =>
    (
      await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze()
    ).violations.flatMap((violation) =>
      violation.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    );
  expect(await audit()).toEqual([]);
  await page.getByRole("button", { name: "Buscar no seu negócio" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await audit()).toEqual([]);
});

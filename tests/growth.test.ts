import { beforeAll, afterAll, it, expect } from "vitest";
import sharp from "sharp";
import { migrate, sql, closeDb } from "../server/db";
import { tenant } from "../server/service";
import {
  premium,
  saveGrowth,
  renderDesign,
  requirePremium,
} from "../server/growth";
import { readCatalog, validateCatalogQuery } from "../server/catalog";
import { attributeIssues, relevantCategories } from "../shared/catalog";
import { profileSchema } from "../shared/domain";
import { preparePrompt, thirtyDays, metricAdvice } from "../shared/growth";
const design = {
  template: "clean",
  headline: "Texto seguro <script>",
  body: "Texto real do negócio",
  cta: "Converse com a gente",
  business: "Marca de teste",
  background: "#f5f4ee",
  foreground: "#242539",
  accent: "#4145b7",
  format: "square",
};
it("requires state and municipality before advancing beyond location while allowing the initial draft", () => {
  const p = {
    name: "QA · Perfil",
    area: "Marcenaria",
    profession: "Marceneiro",
    state: "",
    city: "",
    cityId: "",
    stage: "starting",
    offer: "both",
    team: "solo",
    attendance: "mixed",
    goals: [],
    timezone: "America/Sao_Paulo",
    step: 3,
    complete: false,
  };
  expect(profileSchema.safeParse(p).success).toBe(true);
  const result = profileSchema.safeParse({ ...p, step: 4 });
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.error.issues.map((i) => i.path.join("."))).toEqual(
      expect.arrayContaining(["state", "cityId"]),
    );
  expect(
    profileSchema.safeParse({
      ...p,
      step: 6,
      complete: true,
      state: "SP",
      city: "São Paulo",
      cityId: "3550308",
    }).success,
  ).toBe(true);
});
beforeAll(async () => {
  await migrate();
  for (const id of ["growth-a", "growth-b"]) {
    await sql.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$1,$2,true,now(),now())',
      [id, id + "@example.test"],
    );
    await sql.query(
      "INSERT INTO companies(id,name,owner_id,plan,subscription_status) VALUES($1,$1,$1,'essencial','inactive')",
      [id],
    );
    await sql.query("INSERT INTO memberships VALUES($1,$1,'owner')", [id]);
  }
});
afterAll(closeDb);
it("blocks every tenant operation for pending accounts except explicitly authorized own profile", async () => {
  await expect(
    tenant(
      { id: "growth-a", emailVerified: false },
      "growth-a",
      "read",
      async () => true,
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    await tenant(
      { id: "growth-a", emailVerified: false },
      "growth-a",
      "settings",
      async (c) => c.company.id,
      false,
      true,
    ),
  ).toBe("growth-a");
  await expect(
    tenant(
      { id: "growth-b", emailVerified: false },
      "growth-a",
      "settings",
      async () => true,
      false,
      true,
    ),
  ).rejects.toMatchObject({ status: 404 });
});
it("separates resale from manufacturing and validates DB-driven attributes including dependencies", async () => {
  const c = await readCatalog();
  expect(c.areas).toHaveLength(12);
  expect(
    relevantCategories(c, "Roupas e moda", "resale").some(
      (c) => c.id === "ready-fashion",
    ),
  ).toBe(true);
  expect(
    relevantCategories(c, "Roupas e moda", "resale").some(
      (c) => c.id === "fabrication",
    ),
  ).toBe(false);
  expect(
    relevantCategories(c, "Roupas e moda", "manufacturing").some(
      (c) => c.id === "fabrication",
    ),
  ).toBe(true);
  await expect(
    validateCatalogQuery({
      category: "mdf",
      specs: { thickness: "18" },
      unit: "un",
    }),
  ).rejects.toMatchObject({
    fieldErrors: { "specs.dimensions": expect.any(String) },
  });
  const p = c.products.find((p) => p.id === "clothing")!;
  expect(
    attributeIssues(p, { sizes: "Grade infantil" })["specs.childGrade"],
  ).toBeTruthy();
  expect(
    attributeIssues(p, { sizes: "M" })["specs.childGrade"],
  ).toBeUndefined();
  await expect(
    validateCatalogQuery({
      category: "mdf",
      specs: {
        thickness: "18",
        dimensions: "2750 x 1850",
        finish: "Melamínico",
        color: "Outra cor",
      },
      unit: "un",
    }),
  ).rejects.toMatchObject({
    fieldErrors: { "specs.colorDetail": expect.any(String) },
  });
});
it("honors active Completo or server grants, rejects forged companies and isolates documents under RLS", async () => {
  await tenant({ id: "growth-a" }, "growth-a", "write", async (c) => {
    expect((await premium(c)).active).toBe(false);
    await expect(saveGrowth(c, "design", design)).rejects.toMatchObject({
      status: 403,
    });
  });
  await sql.query(
    "INSERT INTO company_entitlements(company_id,granted_by,reason,expires_at) VALUES('growth-a','growth-b','Concessão exclusiva de teste',now()+interval '1 day')",
  );
  let id = "";
  await tenant(
    { id: "growth-a" },
    "growth-a",
    "write",
    async (c) => {
      id = (await saveGrowth(c, "design", design)).id;
      expect((await premium(c)).source).toBe("administrator");
    },
    true,
  );
  await expect(
    tenant({ id: "growth-b" }, "growth-a", "read", requirePremium),
  ).rejects.toMatchObject({ status: 404 });
  await sql.query("CREATE ROLE growth_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS");
  await sql.query(
    "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO growth_runtime",
  );
  await sql.query("SET ROLE growth_runtime");
  try {
    await tenant({ id: "growth-b" }, "growth-b", "read", async (c) => {
      expect(
        (await c.tx.query("SELECT * FROM growth_documents WHERE id=$1", [id]))
          .rows,
      ).toEqual([]);
      expect(
        (await c.tx.query("SELECT * FROM company_entitlements")).rows,
      ).toEqual([]);
      await c.tx.query("SAVEPOINT grant_block");
      await expect(
        c.tx.query("INSERT INTO platform_admins VALUES('growth-b')"),
      ).rejects.toThrow();
      await c.tx.query("ROLLBACK TO SAVEPOINT grant_block");
      await c.tx.query("SAVEPOINT cross_insert");
      await expect(
        c.tx.query(
          "INSERT INTO growth_documents(id,company_id,kind,data) VALUES('evil','growth-a','design','{}')",
        ),
      ).rejects.toThrow();
      await c.tx.query("ROLLBACK TO SAVEPOINT cross_insert");
    });
  } finally {
    await sql.query("RESET ROLE");
  }
  await sql.query(
    "UPDATE company_entitlements SET expires_at=now()-interval '1 second' WHERE company_id='growth-a'",
  );
  await tenant({ id: "growth-a" }, "growth-a", "read", async (c) => {
    await expect(requirePremium(c)).rejects.toMatchObject({ status: 403 });
  });
  await sql.query(
    "UPDATE companies SET plan='completo',subscription_status='active' WHERE id='growth-a'",
  );
  await tenant({ id: "growth-a" }, "growth-a", "read", async (c) =>
    expect((await premium(c)).active).toBe(true),
  );
});
it("prepares local prompts and thirty editable ideas without claiming images or real metrics", () => {
  const prompt = preparePrompt({
    business: "Meu negócio",
    activity: "Roupas",
    objective: "Apresentar",
    audience: "Adultos",
    product: "Camiseta",
    headline: "Uma escolha sua",
    cta: "Conheça",
    tone: "Direto",
    colors: "#4145b7",
    format: "square",
    photoInstructions: "Preservar o produto",
    restrictions: "",
  });
  expect(prompt).toContain("Enviarei a foto manualmente");
  expect(prompt).toContain("Não invente preços");
  expect(thirtyDays("Camisetas", "Apresentar")).toHaveLength(30);
  expect(
    thirtyDays("Camisetas", "Apresentar").every((p) => p.status === "planned"),
  ).toBe(true);
  expect(metricAdvice([])[0]).toContain("Não há dados suficientes");
});
it("exports actual PNG and JPEG with exact dimensions, escaping text and accepting only a local raster photo", async () => {
  const photo = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#aaaacc" },
  })
    .png()
    .toBuffer();
  const png = await renderDesign(design, photo);
  expect(await sharp(png).metadata()).toMatchObject({
    format: "png",
    width: 1080,
    height: 1080,
  });
  const jpeg = await renderDesign(
    { ...design, format: "story", template: "editorial" },
    undefined,
    "jpeg",
  );
  expect(await sharp(jpeg).metadata()).toMatchObject({
    format: "jpeg",
    width: 1080,
    height: 1920,
  });
  await expect(
    renderDesign({ ...design, background: "url(https://evil.invalid)" }),
  ).rejects.toThrow();
});

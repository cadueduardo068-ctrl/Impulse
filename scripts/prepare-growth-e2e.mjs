// Explicit local-only QA fixture. The database lock refuses use while the application is running.
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { sql, migrate, closeDb } from "../server/db.ts";
import {config} from "../server/config.ts";
import { auth } from "../server/auth.ts";
if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL)
  throw new Error(
    "Fixtures permitidas apenas no PGlite local de desenvolvimento.",
  );
try {
  await migrate();
  let fixture;
  try {
    fixture = JSON.parse(await readFile(".data/e2e-growth.json", "utf8"));
  } catch {
    /* first local run */
  }
  if (
    fixture &&
    (await sql.query('SELECT 1 FROM "user" WHERE id=$1', [fixture.userId])).rows
      .length
  ) {
    await sql.query("INSERT INTO consents(id,user_id,terms_version,privacy_version,promotional) VALUES($1,$2,$3,$4,false)",[randomUUID(),fixture.userId,config.termsVersion,config.privacyVersion]);
    console.log("Fixture local de QA existente, com aceite de QA atualizado.");
  } else {
    const email = "qa-growth-" + Date.now() + "@example.test",
      password = "QA!" + randomBytes(20).toString("base64url");
    const result = await auth.api.signUpEmail({
      headers: new Headers({ origin: config.url }),
      body: {
        email,
        password,
        name: "QA · Programa Instagram",
        termsAccepted: true,
        promotional: false,
      },
    });
    await sql.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1', [
      result.user.id,
    ]);
    const companyId = randomUUID();
    const profile = {
      name: "QA · Empresa de teste Premium",
      area: "Roupas e moda",
      profession: "Loja de roupas",
      state: "SP",
      city: "São Paulo",
      cityId: "3550308",
      cep: "",
      stage: "operating",
      offer: "products",
      team: "solo",
      attendance: "mixed",
      goals: ["Instagram e divulgação"],
      timezone: "America/Sao_Paulo",
      step: 6,
      complete: true,
      buysMaterials: "yes",
      purchasePurposes: ["resale", "manufacturing"],
      purchaseCategories: ["ready-fashion", "fabrication"],
      purchaseProducts: ["clothing", "fabric"],
    };
    await sql.query(
      "INSERT INTO companies(id,name,profile,owner_id,trial_end) VALUES($1,$2,$3,$4,now()+interval '7 days')",
      [companyId, profile.name, JSON.stringify(profile), result.user.id],
    );
    await sql.query("INSERT INTO memberships VALUES($1,$2,'owner')", [
      companyId,
      result.user.id,
    ]);
    await sql.query("INSERT INTO platform_admins VALUES($1)", [result.user.id]);
    await sql.query(
      "INSERT INTO company_entitlements(company_id,granted_by,reason,expires_at) VALUES($1,$2,'Concessão local explícita para QA automatizado',now()+interval '1 day')",
      [companyId, result.user.id],
    );
    await sql.query(
      "INSERT INTO platform_audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)",
      [
        randomUUID(),
        result.user.id,
        "qa.fixture.provisioned-premium-1day",
        companyId,
      ],
    );
    await writeFile(
      ".data/e2e-growth.json",
      JSON.stringify({ email, password, userId: result.user.id, companyId }),
      { mode: 0o600 },
    );
    console.log("Fixture local de QA criada; credenciais não exibidas.");
  }
} finally {
  await closeDb();
}


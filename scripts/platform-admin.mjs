// Run with the development server stopped. Never accepts a password or promotes company owners implicitly.
import { sql, closeDb, migrate } from "../server/db.ts";
import { randomUUID } from "node:crypto";
const email = process.argv[2];
if (!email || !email.includes("@"))
  throw new Error(
    "Uso: node --env-file-if-exists=.env --import tsx scripts/platform-admin.mjs email-do-operador",
  );
try {
  await migrate();
  const user = (
    await sql.query(
      'SELECT id,"emailVerified" FROM "user" WHERE lower(email)=lower($1)',
      [email],
    )
  ).rows[0];
  if (!user?.emailVerified)
    throw new Error("O operador precisa ter conta com e-mail confirmado.");
  await sql.query(
    "INSERT INTO platform_admins(user_id) VALUES($1) ON CONFLICT DO NOTHING",
    [user.id],
  );
  await sql.query(
    "INSERT INTO platform_audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$2)",
    [randomUUID(), user.id, "platform.admin.provisioned-by-local-operator"],
  );
  console.log(
    "Administrador autorizado. Reinicie o servidor e entre novamente.",
  );
} finally {
  await closeDb();
}

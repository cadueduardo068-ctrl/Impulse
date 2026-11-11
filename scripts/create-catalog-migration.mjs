import { initialCatalog } from "../shared/catalog.ts";
import { writeFile } from "node:fs/promises";
const literal = (v) => "'" + String(v).replaceAll("'", "''") + "'";
let sql = `CREATE TABLE platform_admins(user_id text PRIMARY KEY REFERENCES "user"(id));
CREATE TABLE catalog_nodes(id text PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('area','activity','category','product')),parent_id text REFERENCES catalog_nodes(id),name text NOT NULL,data jsonb NOT NULL DEFAULT '{}',version integer NOT NULL DEFAULT 1,active boolean NOT NULL DEFAULT true);
CREATE TABLE catalog_attributes(id text PRIMARY KEY,product_id text NOT NULL REFERENCES catalog_nodes(id),field_key text NOT NULL,data jsonb NOT NULL,UNIQUE(product_id,field_key));
CREATE TABLE catalog_units(id text PRIMARY KEY,name text NOT NULL);
CREATE TABLE catalog_requests(id text PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),user_id text NOT NULL,description text NOT NULL,status text NOT NULL DEFAULT 'pending',created_at timestamptz DEFAULT now());
ALTER TABLE catalog_nodes ENABLE ROW LEVEL SECURITY; ALTER TABLE catalog_nodes FORCE ROW LEVEL SECURITY;
CREATE POLICY catalog_read ON catalog_nodes FOR SELECT USING(true);
CREATE POLICY catalog_admin ON catalog_nodes FOR ALL USING(EXISTS(SELECT 1 FROM platform_admins WHERE user_id=current_setting('app.user_id',true))) WITH CHECK(EXISTS(SELECT 1 FROM platform_admins WHERE user_id=current_setting('app.user_id',true)));
ALTER TABLE catalog_attributes ENABLE ROW LEVEL SECURITY; ALTER TABLE catalog_attributes FORCE ROW LEVEL SECURITY;
CREATE POLICY attributes_read ON catalog_attributes FOR SELECT USING(true);
CREATE POLICY attributes_admin ON catalog_attributes FOR ALL USING(EXISTS(SELECT 1 FROM platform_admins WHERE user_id=current_setting('app.user_id',true))) WITH CHECK(EXISTS(SELECT 1 FROM platform_admins WHERE user_id=current_setting('app.user_id',true)));
ALTER TABLE catalog_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE catalog_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY requests_tenant ON catalog_requests USING(company_id=current_setting('app.company_id',true) AND app_has_role(company_id,current_setting('app.user_id',true),ARRAY['owner','admin','member','finance'])) WITH CHECK(company_id=current_setting('app.company_id',true) AND app_has_role(company_id,current_setting('app.user_id',true),ARRAY['owner','admin','member','finance']));
`;
for (const a of initialCatalog.areas) {
  sql += `INSERT INTO catalog_nodes VALUES(${literal("area-" + a.id)},'area',NULL,${literal(a.name)},${literal(JSON.stringify({ image: a.image }))},1,true);\n`;
  for (const [i, name] of a.activities.entries())
    sql += `INSERT INTO catalog_nodes VALUES(${literal(a.id + "-activity-" + i)},'activity',${literal("area-" + a.id)},${literal(name)},'{}',1,true);\n`;
}
for (const c of initialCatalog.categories)
  sql += `INSERT INTO catalog_nodes VALUES(${literal(c.id)},'category',NULL,${literal(c.name)},${literal(JSON.stringify({ areas: c.areas, purpose: c.purpose }))},1,true);\n`;
for (const p of initialCatalog.products) {
  sql += `INSERT INTO catalog_nodes VALUES(${literal(p.id)},'product',${literal(p.categoryId)},${literal(p.name)},${literal(JSON.stringify({ aliases: p.aliases, units: p.units }))},1,true);\n`;
  for (const a of p.attributes)
    sql += `INSERT INTO catalog_attributes VALUES(${literal(p.id + "-" + a.key)},${literal(p.id)},${literal(a.key)},${literal(JSON.stringify(a))});\n`;
}
for (const u of ["un", "g", "kg", "ml", "l", "mm", "cm", "m", "m2"])
  sql += `INSERT INTO catalog_units VALUES(${literal(u)},${literal(u)});\n`;
await writeFile("migrations/010_activity_catalog.sql", sql);

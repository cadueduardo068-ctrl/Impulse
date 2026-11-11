-- Platform privileges are provisioned only by an operator, never by company owners.
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;
CREATE POLICY own_platform_role ON platform_admins FOR SELECT USING(user_id=current_setting('app.user_id',true));
CREATE TABLE platform_audit(id text PRIMARY KEY,user_id text NOT NULL,action text NOT NULL,entity_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE platform_audit ENABLE ROW LEVEL SECURITY; ALTER TABLE platform_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_audit_admin ON platform_audit USING(EXISTS(SELECT 1 FROM platform_admins WHERE user_id=current_setting('app.user_id',true))) WITH CHECK(EXISTS(SELECT 1 FROM platform_admins WHERE user_id=current_setting('app.user_id',true)));
ALTER TABLE catalog_units ENABLE ROW LEVEL SECURITY; ALTER TABLE catalog_units FORCE ROW LEVEL SECURITY;
CREATE POLICY units_read ON catalog_units FOR SELECT USING(true);
CREATE POLICY units_admin ON catalog_units FOR ALL USING(EXISTS(SELECT 1 FROM platform_admins WHERE user_id=current_setting('app.user_id',true))) WITH CHECK(EXISTS(SELECT 1 FROM platform_admins WHERE user_id=current_setting('app.user_id',true)));
CREATE TABLE company_entitlements(company_id text PRIMARY KEY REFERENCES companies(id),granted_by text NOT NULL REFERENCES "user"(id),reason text NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE company_entitlements ENABLE ROW LEVEL SECURITY; ALTER TABLE company_entitlements FORCE ROW LEVEL SECURITY;
CREATE POLICY entitlement_read ON company_entitlements FOR SELECT USING(company_id=current_setting('app.company_id',true) AND app_has_role(company_id,current_setting('app.user_id',true),ARRAY['owner','admin','member','finance']));
CREATE POLICY entitlement_admin ON company_entitlements FOR ALL USING(EXISTS(SELECT 1 FROM platform_admins WHERE user_id=current_setting('app.user_id',true))) WITH CHECK(EXISTS(SELECT 1 FROM platform_admins WHERE user_id=current_setting('app.user_id',true)));
CREATE TABLE growth_documents(id text PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),kind text NOT NULL CHECK(kind IN ('instagram','post','metric','prompt','design','artwork')),data jsonb NOT NULL,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE growth_files(id text PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),document_id text NOT NULL REFERENCES growth_documents(id),name text NOT NULL,mime text NOT NULL,content bytea NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,id));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['growth_documents','growth_files'] LOOP
EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
EXECUTE format('CREATE POLICY growth_tenant ON %I USING(company_id=current_setting(''app.company_id'',true) AND app_has_role(company_id,current_setting(''app.user_id'',true),ARRAY[''owner'',''admin'',''member'',''finance''])) WITH CHECK(company_id=current_setting(''app.company_id'',true) AND app_has_role(company_id,current_setting(''app.user_id'',true),ARRAY[''owner'',''admin'',''member'',''finance'']))',t);
END LOOP; END $$;

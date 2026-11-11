ALTER TABLE companies ADD COLUMN IF NOT EXISTS profile_version integer NOT NULL DEFAULT 1;
ALTER TABLE records ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
CREATE TABLE material_searches(id text PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),query jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE material_favorites(id text PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),data jsonb NOT NULL,url_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,url_hash));
CREATE TABLE purchase_lists(id text PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),name text NOT NULL,quote_id text REFERENCES quotes(id),order_id text REFERENCES orders(id),version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE purchase_list_items(id text PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),list_id text NOT NULL REFERENCES purchase_lists(id) ON DELETE CASCADE,data jsonb NOT NULL,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE material_offers(id text PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public_search_cache(key text PRIMARY KEY,data jsonb NOT NULL,expires timestamptz NOT NULL);
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['material_searches','material_favorites','purchase_lists','purchase_list_items','material_offers'] LOOP
EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(company_id=current_setting(''app.company_id'',true) AND app_has_role(company_id,current_setting(''app.user_id'',true),ARRAY[''owner'',''admin'',''member'',''finance''])) WITH CHECK(company_id=current_setting(''app.company_id'',true) AND app_has_role(company_id,current_setting(''app.user_id'',true),ARRAY[''owner'',''admin'',''member'',''finance'']))',t);
END LOOP;END $$;

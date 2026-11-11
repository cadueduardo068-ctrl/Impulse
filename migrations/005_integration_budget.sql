CREATE TABLE IF NOT EXISTS integration_budget(company_id text NOT NULL REFERENCES companies(id),month text NOT NULL,used_microcents bigint NOT NULL DEFAULT 0 CHECK(used_microcents>=0),PRIMARY KEY(company_id,month));
ALTER TABLE integration_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_budget FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integration_budget USING(company_id=current_setting('app.company_id',true) AND EXISTS(SELECT 1 FROM memberships m WHERE m.company_id=integration_budget.company_id AND m.user_id=current_setting('app.user_id',true))) WITH CHECK(company_id=current_setting('app.company_id',true) AND EXISTS(SELECT 1 FROM memberships m WHERE m.company_id=integration_budget.company_id AND m.user_id=current_setting('app.user_id',true)));

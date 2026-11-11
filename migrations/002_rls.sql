-- O backend define app.company_id e app.user_id com set_config(..., true) em cada transação.
-- Use papel de aplicação sem SUPERUSER/BYPASSRLS e separado do papel migrador em produção.
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['records','quotes','orders','ledger','payments','stock','movements','invitations','files','audit','privacy_requests','integration_usage','billing_events'] LOOP
EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename=t AND policyname='tenant_isolation') THEN
EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (company_id = current_setting(''app.company_id'',true) AND EXISTS (SELECT 1 FROM memberships m WHERE m.company_id = %I.company_id AND m.user_id=current_setting(''app.user_id'',true))) WITH CHECK (company_id = current_setting(''app.company_id'',true) AND EXISTS (SELECT 1 FROM memberships m WHERE m.company_id = %I.company_id AND m.user_id=current_setting(''app.user_id'',true)))',t,t,t);
END IF;
END LOOP; END $$;

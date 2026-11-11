ALTER TABLE companies ADD COLUMN IF NOT EXISTS owner_id text REFERENCES "user"(id);
UPDATE companies c SET owner_id=(SELECT user_id FROM memberships WHERE company_id=c.id AND role='owner' LIMIT 1) WHERE owner_id IS NULL;
-- O migrador é dono e deve ter BYPASSRLS. A conexão de aplicação usa outro papel.
CREATE OR REPLACE FUNCTION app_has_role(cid text,uid text,roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM public.memberships WHERE company_id=cid AND user_id=uid AND role=ANY(roles)) $$;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY company_select ON companies FOR SELECT USING(owner_id=current_setting('app.user_id',true) OR app_has_role(id,current_setting('app.user_id',true),ARRAY['owner','admin','member','finance']));
CREATE POLICY company_insert ON companies FOR INSERT WITH CHECK(owner_id=current_setting('app.user_id',true));
CREATE POLICY company_update ON companies FOR UPDATE USING(app_has_role(id,current_setting('app.user_id',true),ARRAY['owner','admin'])) WITH CHECK(app_has_role(id,current_setting('app.user_id',true),ARRAY['owner','admin']));
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_select ON memberships FOR SELECT USING(user_id=current_setting('app.user_id',true) OR (company_id=current_setting('app.company_id',true) AND app_has_role(company_id,current_setting('app.user_id',true),ARRAY['owner','admin','member','finance'])));
CREATE POLICY membership_write ON memberships FOR ALL USING(company_id=current_setting('app.company_id',true) AND app_has_role(company_id,current_setting('app.user_id',true),ARRAY['owner','admin'])) WITH CHECK((company_id=current_setting('app.company_id',true) AND app_has_role(company_id,current_setting('app.user_id',true),ARRAY['owner','admin'])) OR (role='owner' AND user_id=current_setting('app.user_id',true) AND EXISTS(SELECT 1 FROM companies WHERE id=company_id AND owner_id=current_setting('app.user_id',true))));
CREATE OR REPLACE FUNCTION accept_team_invitation(p_hash text,p_user text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE inv public.invitations%ROWTYPE; active_count integer;
BEGIN
SELECT * INTO inv FROM public.invitations WHERE token_hash=p_hash AND expires>now() AND accepted_at IS NULL FOR UPDATE;
IF inv.id IS NULL OR NOT EXISTS(SELECT 1 FROM public."user" WHERE id=p_user AND lower(email)=lower(inv.email) AND "emailVerified"=true) THEN RAISE EXCEPTION 'Convite inválido'; END IF;
PERFORM 1 FROM public.companies WHERE id=inv.company_id FOR UPDATE;
SELECT count(*) INTO active_count FROM public.memberships WHERE company_id=inv.company_id;
IF active_count>=10 OR EXISTS(SELECT 1 FROM public.companies WHERE id=inv.company_id AND plan='essencial') THEN RAISE EXCEPTION 'Limite de equipe'; END IF;
INSERT INTO public.memberships(company_id,user_id,role) VALUES(inv.company_id,p_user,inv.role) ON CONFLICT DO NOTHING;
UPDATE public.invitations SET accepted_at=now() WHERE id=inv.id;
RETURN inv.company_id;
END $$;
CREATE OR REPLACE FUNCTION resolve_company_owner(cid text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT user_id FROM public.memberships WHERE company_id=cid AND role='owner' LIMIT 1 $$;

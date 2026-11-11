CREATE OR REPLACE FUNCTION accept_ownership_transfer(p_hash text,p_user text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.ownership_transfers%ROWTYPE;
BEGIN
IF p_user IS DISTINCT FROM current_setting('app.user_id',true) THEN RAISE EXCEPTION 'Sessão inválida'; END IF;
SELECT * INTO t FROM public.ownership_transfers WHERE token_hash=p_hash AND to_id=p_user AND expires>now() AND accepted_at IS NULL AND company_id=current_setting('app.company_id',true) FOR UPDATE;
IF t.id IS NULL OR NOT EXISTS(SELECT 1 FROM public."user" WHERE id=p_user AND "emailVerified"=true) THEN RAISE EXCEPTION 'Transferência inválida'; END IF;
PERFORM 1 FROM public.companies WHERE id=t.company_id AND owner_id=t.from_id FOR UPDATE;
IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.memberships WHERE company_id=t.company_id AND user_id=p_user) THEN RAISE EXCEPTION 'Membros alterados'; END IF;
UPDATE public.memberships SET role='admin' WHERE company_id=t.company_id AND user_id=t.from_id;
UPDATE public.memberships SET role='owner' WHERE company_id=t.company_id AND user_id=p_user;
UPDATE public.companies SET owner_id=p_user WHERE id=t.company_id;
UPDATE public.ownership_transfers SET accepted_at=now() WHERE id=t.id;
RETURN t.company_id;
END $$;

CREATE OR REPLACE FUNCTION next_quote_number(cid text,uid text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
IF NOT public.app_has_role(cid,uid,ARRAY['owner','admin','member']) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
UPDATE public.companies SET quote_sequence=quote_sequence+1 WHERE id=cid RETURNING quote_sequence INTO n;
RETURN n;
END $$;

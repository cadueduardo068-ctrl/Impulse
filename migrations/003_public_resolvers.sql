-- Resoluções por token criptograficamente aleatório. Não devolvem conteúdo privado.
-- Funções pertencem ao migrador; o papel de execução não deve ser dono destas funções/tabelas.
CREATE OR REPLACE FUNCTION resolve_quote_link(p_hash text) RETURNS TABLE(id text,company_id text,owner_id text)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT q.id,q.company_id,m.user_id FROM public.quotes q JOIN public.memberships m ON m.company_id=q.company_id AND m.role='owner' WHERE q.share_hash=p_hash AND q.share_expires>now()
$$;
CREATE OR REPLACE FUNCTION resolve_invitation(p_hash text) RETURNS TABLE(id text,company_id text,email text,role text,expires timestamptz,accepted_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT i.id,i.company_id,i.email,i.role,i.expires,i.accepted_at FROM public.invitations i WHERE i.token_hash=p_hash AND i.expires>now() AND i.accepted_at IS NULL
$$;

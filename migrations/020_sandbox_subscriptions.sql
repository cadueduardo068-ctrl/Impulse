CREATE TABLE sandbox_subscriptions (
  company_id text PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  provider_id text NOT NULL UNIQUE,
  reference text NOT NULL UNIQUE,
  plan text NOT NULL CHECK (plan IN ('essencial','completo')),
  price_cents integer NOT NULL CHECK (price_cents > 0),
  checkout_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
);

ALTER TABLE sandbox_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sandbox_subscription_tenant ON sandbox_subscriptions
  USING (company_id = current_setting('app.company_id', true));

CREATE FUNCTION resolve_sandbox_subscription(p_id text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT company_id FROM public.sandbox_subscriptions WHERE provider_id = p_id
$$;

ALTER TABLE companies ADD COLUMN sandbox_paid_until timestamptz;

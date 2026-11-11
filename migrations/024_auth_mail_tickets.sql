CREATE TABLE auth_mail_tickets (
  ticket_hash text PRIMARY KEY,
  email text NOT NULL,
  action_url text NOT NULL,
  pkce_storage jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);
CREATE INDEX auth_mail_tickets_expiry ON auth_mail_tickets(expires_at);
ALTER TABLE auth_mail_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON auth_mail_tickets FROM PUBLIC;
DO $$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL ON auth_mail_tickets FROM anon; END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL ON auth_mail_tickets FROM authenticated; END IF;
END $$;
CREATE POLICY auth_mail_backend ON auth_mail_tickets
  USING (current_setting('app.auth_mail_backend', true) = '1');

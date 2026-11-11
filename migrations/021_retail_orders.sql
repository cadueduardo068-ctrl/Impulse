ALTER TABLE orders ALTER COLUMN quote_id DROP NOT NULL;
ALTER TABLE orders ADD COLUMN request_key text;
ALTER TABLE orders ADD COLUMN request_hash text;
CREATE UNIQUE INDEX orders_request_key ON orders(company_id,request_key);

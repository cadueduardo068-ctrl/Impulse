ALTER TABLE record_versions ADD CONSTRAINT record_version_tenant FOREIGN KEY(company_id,record_id) REFERENCES records(company_id,id);
ALTER TABLE quote_versions ADD CONSTRAINT quote_version_tenant FOREIGN KEY(company_id,quote_id) REFERENCES quotes(company_id,id);
ALTER TABLE purchase_receipts ADD CONSTRAINT receipt_product_tenant FOREIGN KEY(company_id,product_id) REFERENCES records(company_id,id);
ALTER TABLE movements ADD CONSTRAINT movement_order_tenant FOREIGN KEY(company_id,order_id) REFERENCES orders(company_id,id);
ALTER TABLE stock ADD CONSTRAINT stock_product_tenant FOREIGN KEY(company_id,product_id) REFERENCES records(company_id,id);
CREATE UNIQUE INDEX ledger_company_id ON ledger(company_id,id);
ALTER TABLE payments ADD CONSTRAINT payment_ledger_tenant FOREIGN KEY(company_id,ledger_id) REFERENCES ledger(company_id,id);

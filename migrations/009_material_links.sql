CREATE UNIQUE INDEX quotes_id_company ON quotes(id,company_id);
CREATE UNIQUE INDEX orders_id_company ON orders(id,company_id);
CREATE UNIQUE INDEX purchase_lists_id_company ON purchase_lists(id,company_id);
ALTER TABLE purchase_lists ADD CONSTRAINT list_quote_tenant FOREIGN KEY(quote_id,company_id) REFERENCES quotes(id,company_id);
ALTER TABLE purchase_lists ADD CONSTRAINT list_order_tenant FOREIGN KEY(order_id,company_id) REFERENCES orders(id,company_id);
ALTER TABLE purchase_list_items ADD CONSTRAINT item_list_tenant FOREIGN KEY(list_id,company_id) REFERENCES purchase_lists(id,company_id) ON DELETE CASCADE;

ALTER TABLE purchase_receipts ADD COLUMN purchase_snapshot jsonb NOT NULL DEFAULT '{}';
UPDATE purchase_receipts r SET purchase_snapshot=i.data FROM purchase_list_items i WHERE i.company_id=r.company_id AND i.id=r.list_item_id;
CREATE UNIQUE INDEX records_company_sku_active ON records(company_id,lower(data->>'sku')) WHERE kind='products' AND deleted_at IS NULL AND coalesce(data->>'sku','')<>'';

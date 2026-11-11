ALTER TABLE companies ADD COLUMN catalog_share_hash text;
CREATE UNIQUE INDEX companies_catalog_share_hash ON companies(catalog_share_hash)
  WHERE catalog_share_hash IS NOT NULL;

CREATE FUNCTION resolve_public_catalog(p_hash text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object(
    'companyName', company.name,
    'items', coalesce((
      SELECT jsonb_agg(items.item)
      FROM (
        SELECT jsonb_build_object(
          'name', product.data->>'name',
          'size', product.data->>'size',
          'color', product.data->>'color',
          'priceCents', (product.data->>'priceCents')::bigint
        ) AS item
        FROM public.records product
        WHERE product.company_id = company.id
          AND product.kind = 'products'
          AND product.deleted_at IS NULL
          AND product.data->>'status' = 'active'
          AND product.data->>'publicCatalog' = 'true'
        ORDER BY product.data->>'name', product.id
        LIMIT 500
      ) items
    ), '[]'::jsonb)
  )
  FROM public.companies company
  WHERE company.catalog_share_hash = p_hash
$$;

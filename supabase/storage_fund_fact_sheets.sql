-- Supabase Storage: bucket for ETF / mutual fund fact sheet PDFs.
-- Run in Supabase SQL Editor once. Adjust RLS for your auth model (anon vs authenticated).

INSERT INTO storage.buckets (id, name, public)
VALUES ('fund-fact-sheets', 'fund-fact-sheets', false)
ON CONFLICT (id) DO NOTHING;

-- Allow read/write for anon + authenticated. For authenticated-only policies, see
-- `storage_fund_fact_sheets_authenticated_only.sql`.
DROP POLICY IF EXISTS "fund_fact_sheets_select" ON storage.objects;
DROP POLICY IF EXISTS "fund_fact_sheets_insert" ON storage.objects;
DROP POLICY IF EXISTS "fund_fact_sheets_update" ON storage.objects;
DROP POLICY IF EXISTS "fund_fact_sheets_delete" ON storage.objects;

CREATE POLICY "fund_fact_sheets_select"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'fund-fact-sheets');

CREATE POLICY "fund_fact_sheets_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'fund-fact-sheets');

CREATE POLICY "fund_fact_sheets_update"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'fund-fact-sheets')
WITH CHECK (bucket_id = 'fund-fact-sheets');

CREATE POLICY "fund_fact_sheets_delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'fund-fact-sheets');

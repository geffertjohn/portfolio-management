-- Tighter Storage policies for production: authenticated users only (no anon).
-- Run after you rely on Supabase Auth for the client. This drops the anon-friendly
-- policies from `storage_fund_fact_sheets.sql` and replaces them.
--
-- Prerequisites: bucket `fund-fact-sheets` exists (see storage_fund_fact_sheets.sql).

DROP POLICY IF EXISTS "fund_fact_sheets_select" ON storage.objects;
DROP POLICY IF EXISTS "fund_fact_sheets_insert" ON storage.objects;
DROP POLICY IF EXISTS "fund_fact_sheets_update" ON storage.objects;
DROP POLICY IF EXISTS "fund_fact_sheets_delete" ON storage.objects;

CREATE POLICY "fund_fact_sheets_select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'fund-fact-sheets');

CREATE POLICY "fund_fact_sheets_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'fund-fact-sheets');

CREATE POLICY "fund_fact_sheets_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'fund-fact-sheets')
WITH CHECK (bucket_id = 'fund-fact-sheets');

CREATE POLICY "fund_fact_sheets_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'fund-fact-sheets');

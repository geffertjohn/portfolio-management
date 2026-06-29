-- Review schedules and review log tables
-- Run once in the Supabase SQL Editor.
-- Safe to re-run: all statements use IF NOT EXISTS.

-- ── review_schedules ──────────────────────────────────────────────────────────
-- One row per security. Tracks cadence, last reviewed date, and next due date.

CREATE TABLE IF NOT EXISTS review_schedules (
  id              bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  security_id     bigint        NOT NULL REFERENCES securities2(id) ON DELETE CASCADE,
  cadence         text          NOT NULL CHECK (cadence IN ('quarterly', 'semi_annual', 'annual')),
  last_reviewed_at timestamptz  NULL,
  next_review_at  timestamptz   NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (security_id)
);

CREATE INDEX IF NOT EXISTS review_schedules_next_review_idx
  ON review_schedules (next_review_at);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS review_schedules_set_updated_at ON review_schedules;
CREATE TRIGGER review_schedules_set_updated_at
  BEFORE UPDATE ON review_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE review_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read review_schedules"  ON review_schedules;
DROP POLICY IF EXISTS "Authenticated users can insert review_schedules" ON review_schedules;
DROP POLICY IF EXISTS "Authenticated users can update review_schedules" ON review_schedules;
DROP POLICY IF EXISTS "Authenticated users can delete review_schedules" ON review_schedules;

CREATE POLICY "Allow read review_schedules"
  ON review_schedules FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow insert review_schedules"
  ON review_schedules FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow update review_schedules"
  ON review_schedules FOR UPDATE TO anon, authenticated USING (true);

CREATE POLICY "Allow delete review_schedules"
  ON review_schedules FOR DELETE TO anon, authenticated USING (true);


-- ── review_log ────────────────────────────────────────────────────────────────
-- One row per completed review. Written by markReviewed() alongside the
-- review_schedules upsert so history is never lost.

CREATE TABLE IF NOT EXISTS review_log (
  id           bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  security_id  bigint       NOT NULL REFERENCES securities2(id) ON DELETE CASCADE,
  reviewed_at  timestamptz  NOT NULL DEFAULT now(),
  notes        text         NULL,
  reviewed_by  text         NULL,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_log_security_id_idx
  ON review_log (security_id, reviewed_at DESC);

-- RLS
ALTER TABLE review_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read review_log"   ON review_log;
DROP POLICY IF EXISTS "Authenticated users can insert review_log"  ON review_log;
DROP POLICY IF EXISTS "Authenticated users can delete review_log"  ON review_log;

CREATE POLICY "Allow read review_log"
  ON review_log FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow insert review_log"
  ON review_log FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow delete review_log"
  ON review_log FOR DELETE TO anon, authenticated USING (true);

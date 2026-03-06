-- Contest calendar reference table
-- Read-only schedule data populated by admin/seed scripts.
-- Contains concrete contest events with UTC start/end times.

CREATE TABLE IF NOT EXISTS public.contest_calendar (
  id                      TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  sponsor                 TEXT NOT NULL,
  start_utc               TIMESTAMPTZ NOT NULL,
  end_utc                 TIMESTAMPTZ NOT NULL,
  bands                   TEXT[] NOT NULL DEFAULT '{}',
  modes                   TEXT[] NOT NULL DEFAULT '{}',
  exchange                TEXT NOT NULL DEFAULT '',
  description             TEXT NOT NULL DEFAULT '',
  difficulty              TEXT NOT NULL DEFAULT 'intermediate'
                            CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  estimated_participants  INTEGER NOT NULL DEFAULT 0,
  tags                    TEXT[] NOT NULL DEFAULT '{}',
  warc_exempt             BOOLEAN NOT NULL DEFAULT FALSE,
  rules_url               TEXT,
  definition_id           TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for calendar queries
CREATE INDEX IF NOT EXISTS idx_contest_calendar_start
  ON public.contest_calendar(start_utc DESC);
CREATE INDEX IF NOT EXISTS idx_contest_calendar_end
  ON public.contest_calendar(end_utc DESC);
CREATE INDEX IF NOT EXISTS idx_contest_calendar_active
  ON public.contest_calendar(start_utc, end_utc);

-- Row Level Security — public read, service-role write
ALTER TABLE public.contest_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read contest calendar"
  ON public.contest_calendar FOR SELECT
  USING (true);

-- Service role can insert/update/delete (admin seeding only)
CREATE POLICY "Service role can manage contest calendar"
  ON public.contest_calendar FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

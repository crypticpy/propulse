-- FT8/FT4 decode persistence
-- Stores decoded digital mode messages for crash recovery and cloud backup.

CREATE TABLE IF NOT EXISTS ft8_decodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  time INTEGER NOT NULL,
  snr INTEGER NOT NULL,
  delta_time REAL NOT NULL,
  delta_frequency INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'FT8',
  message TEXT NOT NULL,
  callsign TEXT,
  grid TEXT,
  is_cq BOOLEAN DEFAULT FALSE,
  low_confidence BOOLEAN DEFAULT FALSE,
  frequency_hz BIGINT,
  band TEXT,
  my_callsign TEXT,
  instance_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ft8_decodes_user_timestamp
  ON ft8_decodes(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ft8_decodes_user_callsign
  ON ft8_decodes(user_id, callsign)
  WHERE callsign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ft8_decodes_user_band
  ON ft8_decodes(user_id, band)
  WHERE band IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ft8_decodes_updated
  ON ft8_decodes(user_id, updated_at);

-- Row Level Security
ALTER TABLE ft8_decodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own decodes"
  ON ft8_decodes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own decodes"
  ON ft8_decodes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own decodes"
  ON ft8_decodes FOR UPDATE
  USING (auth.uid() = user_id);

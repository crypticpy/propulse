-- QSO Sync Engine: version tracking, device ID, and soft delete support
-- Adds version vectors for delta sync between multiple devices

-- Add version column for delta sync (monotonically increasing per-row)
ALTER TABLE log_entries
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;

-- Add device_id column to track originating device
ALTER TABLE log_entries
  ADD COLUMN IF NOT EXISTS device_id text;

-- deleted_at already exists (checked), but ensure it exists defensively
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'log_entries' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE log_entries ADD COLUMN deleted_at timestamptz;
  END IF;
END
$$;

-- Index for efficient delta pulls: (user_id, version)
-- Supports queries like: WHERE user_id = $1 AND version > $2 ORDER BY version ASC
CREATE INDEX IF NOT EXISTS idx_log_entries_user_version
  ON log_entries (user_id, version);

-- Index for device-specific queries
CREATE INDEX IF NOT EXISTS idx_log_entries_device_id
  ON log_entries (device_id)
  WHERE device_id IS NOT NULL;

-- Trigger function: auto-increment version on UPDATE
-- Each update bumps the version, enabling delta sync consumers to detect changes
CREATE OR REPLACE FUNCTION increment_log_entry_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Only increment if the row data actually changed (not just version bump)
  IF NEW.version = OLD.version THEN
    NEW.version := OLD.version + 1;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to log_entries
DROP TRIGGER IF EXISTS trg_log_entry_version ON log_entries;
CREATE TRIGGER trg_log_entry_version
  BEFORE UPDATE ON log_entries
  FOR EACH ROW
  EXECUTE FUNCTION increment_log_entry_version();

-- RLS: users can only read/write their own entries
-- (RLS should already be enabled, but ensure it)
ALTER TABLE log_entries ENABLE ROW LEVEL SECURITY;

-- Read policy: users see only their own entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'log_entries' AND policyname = 'log_entries_select_own'
  ) THEN
    CREATE POLICY log_entries_select_own ON log_entries
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END
$$;

-- Insert policy: users can only insert their own entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'log_entries' AND policyname = 'log_entries_insert_own'
  ) THEN
    CREATE POLICY log_entries_insert_own ON log_entries
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- Update policy: users can only update their own entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'log_entries' AND policyname = 'log_entries_update_own'
  ) THEN
    CREATE POLICY log_entries_update_own ON log_entries
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END
$$;

-- Delete policy: users can only delete their own entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'log_entries' AND policyname = 'log_entries_delete_own'
  ) THEN
    CREATE POLICY log_entries_delete_own ON log_entries
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

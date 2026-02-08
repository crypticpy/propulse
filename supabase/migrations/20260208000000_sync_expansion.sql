-- Migration: Sync Expansion — 5 new tables for full data sync
-- Tables: dxcc_worked, inline_components, station_chains, equipment_history, custom_radios

-- ─── DXCC Worked Entities ────────────────────────────────────────────────────
-- Tracks DXCC award progress per band/mode. HIGH priority sync — represents
-- months/years of operating data that cannot be reconstructed without LoTW import.

CREATE TABLE IF NOT EXISTS dxcc_worked (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_id integer NOT NULL,
  band text NOT NULL,
  mode text NOT NULL,
  callsign text NOT NULL,
  worked_at timestamptz NOT NULL,
  confirmed boolean NOT NULL DEFAULT false,
  confirmation_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, entity_id, band, mode)
);

CREATE INDEX idx_dxcc_worked_user ON dxcc_worked(user_id);
CREATE INDEX idx_dxcc_worked_updated ON dxcc_worked(user_id, updated_at);

ALTER TABLE dxcc_worked ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own DXCC entries"
  ON dxcc_worked FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own DXCC entries"
  ON dxcc_worked FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own DXCC entries"
  ON dxcc_worked FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own DXCC entries"
  ON dxcc_worked FOR DELETE
  USING (auth.uid() = user_id);


-- ─── Inline Components ───────────────────────────────────────────────────────
-- Adapters, pigtails, chokes, baluns, ferrites that sit in the signal path.
-- Discriminated union stored via component_type + specs JSONB snapshot.

CREATE TABLE IF NOT EXISTS inline_components (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  component_type text NOT NULL,
  insertion_loss_db real NOT NULL DEFAULT 0,
  manufacturer text,
  notes text,
  specs jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inline_components_user ON inline_components(user_id);
CREATE INDEX idx_inline_components_updated ON inline_components(user_id, updated_at);

ALTER TABLE inline_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own inline components"
  ON inline_components FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own inline components"
  ON inline_components FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own inline components"
  ON inline_components FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own inline components"
  ON inline_components FOR DELETE
  USING (auth.uid() = user_id);


-- ─── Station Chains ──────────────────────────────────────────────────────────
-- Visual signal path diagrams from the Station Builder Lab.
-- Nodes and feedline runs stored as JSONB arrays.

CREATE TABLE IF NOT EXISTS station_chains (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  nodes jsonb NOT NULL DEFAULT '[]',
  feedline_runs jsonb NOT NULL DEFAULT '[]',
  operating_power_watts real NOT NULL DEFAULT 100,
  shack_accessory_ids text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_station_chains_user ON station_chains(user_id);
CREATE INDEX idx_station_chains_updated ON station_chains(user_id, updated_at);

ALTER TABLE station_chains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own station chains"
  ON station_chains FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own station chains"
  ON station_chains FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own station chains"
  ON station_chains FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own station chains"
  ON station_chains FOR DELETE
  USING (auth.uid() = user_id);


-- ─── Equipment History ───────────────────────────────────────────────────────
-- Audit trail of equipment CRUD operations (max 200 per user, enforced client-side).

CREATE TABLE IF NOT EXISTS equipment_history (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  action text NOT NULL,
  equipment_type text NOT NULL,
  equipment_id text NOT NULL,
  equipment_name text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_equipment_history_user ON equipment_history(user_id);
CREATE INDEX idx_equipment_history_timestamp ON equipment_history(user_id, timestamp DESC);

ALTER TABLE equipment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own equipment history"
  ON equipment_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own equipment history"
  ON equipment_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own equipment history"
  ON equipment_history FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own equipment history"
  ON equipment_history FOR DELETE
  USING (auth.uid() = user_id);


-- ─── Custom Radios ───────────────────────────────────────────────────────────
-- User-defined radio equipment (not from the built-in database).
-- Full RadioEquipment spec stored as JSONB snapshot.

CREATE TABLE IF NOT EXISTS custom_radios (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  manufacturer text,
  specs jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_custom_radios_user ON custom_radios(user_id);
CREATE INDEX idx_custom_radios_updated ON custom_radios(user_id, updated_at);

ALTER TABLE custom_radios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own custom radios"
  ON custom_radios FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own custom radios"
  ON custom_radios FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own custom radios"
  ON custom_radios FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own custom radios"
  ON custom_radios FOR DELETE
  USING (auth.uid() = user_id);

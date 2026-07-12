-- Propagation V4 serving, personalization, and consent contracts.

ALTER TABLE public.station_chains
  ADD COLUMN IF NOT EXISTS linked_location_id text;

ALTER TABLE public.station_chains
  DROP CONSTRAINT IF EXISTS station_chains_linked_location_fkey;
ALTER TABLE public.station_chains
  ADD CONSTRAINT station_chains_linked_location_fkey
  FOREIGN KEY (user_id, linked_location_id)
  REFERENCES public.saved_locations(user_id, id)
  ON DELETE SET NULL (linked_location_id);

CREATE TABLE IF NOT EXISTS public.propagation_model_versions (
  id text PRIMARY KEY,
  model_family text NOT NULL,
  status text NOT NULL CHECK (status IN ('research', 'shadow', 'active', 'retired', 'rejected')),
  feature_schema text NOT NULL,
  artifact_uri text,
  artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  calibrator_sha256 text CHECK (calibrator_sha256 IS NULL OR calibrator_sha256 ~ '^[0-9a-f]{64}$'),
  training_manifest_uri text NOT NULL,
  license_spdx text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  limitations text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.propagation_feature_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_snapshot_sha256 text NOT NULL UNIQUE CHECK (feature_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  issue_time timestamptz NOT NULL,
  valid_time timestamptz NOT NULL,
  available_at timestamptz NOT NULL,
  source_freshness jsonb NOT NULL,
  outage_flags text[] NOT NULL DEFAULT '{}',
  object_uri text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_at <= issue_time),
  CHECK (valid_time >= issue_time)
);

CREATE TABLE IF NOT EXISTS public.propagation_surface_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  model_version text NOT NULL REFERENCES public.propagation_model_versions(id),
  feature_issuance_id uuid REFERENCES public.propagation_feature_issuances(id),
  origin_grid4 text NOT NULL CHECK (origin_grid4 ~ '^[A-R]{2}[0-9]{2}$'),
  chain_fingerprint text NOT NULL,
  band text NOT NULL,
  mode text NOT NULL,
  horizon_hours integer NOT NULL CHECK (horizon_hours IN (0, 1, 3, 6, 12, 24)),
  issue_bucket timestamptz NOT NULL,
  object_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, model_version, origin_grid4, chain_fingerprint, band, mode, horizon_hours, issue_bucket)
);

CREATE TABLE IF NOT EXISTS public.propagation_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  model_version text NOT NULL REFERENCES public.propagation_model_versions(id),
  feature_issuance_id uuid REFERENCES public.propagation_feature_issuances(id),
  feature_contract text NOT NULL,
  chain_fingerprint text NOT NULL,
  origin_grid4 text NOT NULL CHECK (origin_grid4 ~ '^[A-R]{2}[0-9]{2}$'),
  target_grid4 text NOT NULL CHECK (target_grid4 ~ '^[A-R]{2}[0-9]{2}$'),
  issue_time timestamptz NOT NULL,
  valid_time timestamptz NOT NULL,
  band text NOT NULL,
  mode text NOT NULL,
  declared_power_watts real NOT NULL CHECK (declared_power_watts >= 0),
  core_probability real NOT NULL CHECK (core_probability BETWEEN 0 AND 1),
  personalized_probability real CHECK (personalized_probability BETWEEN 0 AND 1),
  confidence real NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  ood_flags text[] NOT NULL DEFAULT '{}',
  freshness jsonb NOT NULL DEFAULT '{}'::jsonb,
  assumptions text[] NOT NULL DEFAULT '{}',
  sampled_for_research boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  CHECK (valid_time >= issue_time)
);

CREATE TABLE IF NOT EXISTS public.propagation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prediction_id uuid,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  band text NOT NULL,
  mode text NOT NULL,
  declared_power_watts real CHECK (declared_power_watts >= 0),
  origin_grid4 text NOT NULL CHECK (origin_grid4 ~ '^[A-R]{2}[0-9]{2}$'),
  target_grid4 text CHECK (target_grid4 IS NULL OR target_grid4 ~ '^[A-R]{2}[0-9]{2}$'),
  chain_fingerprint text NOT NULL,
  evidence_grade text NOT NULL CHECK (evidence_grade IN ('bridge', 'wsjtx', 'rig', 'logbook', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  FOREIGN KEY (prediction_id, user_id)
    REFERENCES public.propagation_predictions(id, user_id)
    ON DELETE SET NULL (prediction_id),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE IF NOT EXISTS public.propagation_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL,
  outcome_type text NOT NULL CHECK (outcome_type IN (
    'receive_success', 'receive_failure', 'contact_success', 'contact_failure',
    'not_attempted', 'unknown'
  )),
  evidence_grade text NOT NULL CHECK (evidence_grade IN ('bridge', 'wsjtx', 'rig', 'logbook', 'manual')),
  observed_at timestamptz NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (attempt_id, user_id)
    REFERENCES public.propagation_attempts(id, user_id) ON DELETE CASCADE,
  UNIQUE (attempt_id)
);

CREATE TABLE IF NOT EXISTS public.ml_research_consents (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  policy_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('opted_in', 'withdrawn')),
  allowed_uses text[] NOT NULL DEFAULT '{}',
  consented_at timestamptz,
  withdrawn_at timestamptz,
  retention_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'opted_in' AND consented_at IS NOT NULL AND withdrawn_at IS NULL)
    OR (status = 'withdrawn' AND withdrawn_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS propagation_predictions_user_time_idx
  ON public.propagation_predictions(user_id, issue_time DESC);
CREATE INDEX IF NOT EXISTS propagation_attempts_user_time_idx
  ON public.propagation_attempts(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS propagation_surface_expiry_idx
  ON public.propagation_surface_cache(expires_at);

ALTER TABLE public.propagation_model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_feature_issuances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_surface_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propagation_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_research_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY propagation_models_public_read
  ON public.propagation_model_versions FOR SELECT USING (true);
CREATE POLICY propagation_features_public_read
  ON public.propagation_feature_issuances FOR SELECT USING (true);

CREATE POLICY propagation_surface_own_all
  ON public.propagation_surface_cache FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY propagation_predictions_own_read
  ON public.propagation_predictions FOR SELECT
  USING ((select auth.uid()) = user_id);
CREATE POLICY propagation_predictions_own_delete
  ON public.propagation_predictions FOR DELETE
  USING ((select auth.uid()) = user_id);

CREATE POLICY propagation_attempts_own_all
  ON public.propagation_attempts FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY propagation_outcomes_own_all
  ON public.propagation_outcomes FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY ml_research_consents_own_all
  ON public.ml_research_consents FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE TRIGGER propagation_attempts_updated_at
  BEFORE UPDATE ON public.propagation_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER ml_research_consents_updated_at
  BEFORE UPDATE ON public.ml_research_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.propagation_predictions IS
  'Sampled issued predictions with provenance; never stores raw shack inventory or exact coordinates.';
COMMENT ON TABLE public.propagation_outcomes IS
  'Outcomes require an explicit attempt; a viewed prediction cannot become a failure.';

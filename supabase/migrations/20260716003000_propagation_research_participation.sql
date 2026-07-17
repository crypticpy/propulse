-- Server-authoritative opt-in research participation boundary.
-- Prediction receipts are verified by the product API before service-role writes.

ALTER TABLE public.ml_research_consents
  ADD COLUMN IF NOT EXISTS retention_acknowledged_at timestamptz;

ALTER TABLE public.ml_research_consents
  DROP CONSTRAINT IF EXISTS ml_research_consents_allowed_uses_check;
ALTER TABLE public.ml_research_consents
  ADD CONSTRAINT ml_research_consents_allowed_uses_check CHECK (
    cardinality(allowed_uses) <= 4
    AND allowed_uses <@ ARRAY[
      'anonymous_quality_metrics',
      'derived_equipment_training',
      'attempt_outcome_training',
      'research_follow_up'
    ]::text[]
  );

CREATE UNIQUE INDEX IF NOT EXISTS propagation_attempts_prediction_once_idx
  ON public.propagation_attempts (user_id, prediction_id)
  WHERE prediction_id IS NOT NULL;

DROP POLICY IF EXISTS propagation_attempts_own_all
  ON public.propagation_attempts;
DROP POLICY IF EXISTS propagation_outcomes_own_all
  ON public.propagation_outcomes;
DROP POLICY IF EXISTS ml_research_consents_own_all
  ON public.ml_research_consents;

CREATE POLICY propagation_attempts_own_read
  ON public.propagation_attempts FOR SELECT
  USING ((select auth.uid()) = user_id);
CREATE POLICY propagation_attempts_own_delete
  ON public.propagation_attempts FOR DELETE
  USING ((select auth.uid()) = user_id);
CREATE POLICY propagation_outcomes_own_read
  ON public.propagation_outcomes FOR SELECT
  USING ((select auth.uid()) = user_id);
CREATE POLICY propagation_outcomes_own_delete
  ON public.propagation_outcomes FOR DELETE
  USING ((select auth.uid()) = user_id);
CREATE POLICY ml_research_consents_own_read
  ON public.ml_research_consents FOR SELECT
  USING ((select auth.uid()) = user_id);

REVOKE INSERT, UPDATE ON public.propagation_attempts
  FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.propagation_outcomes
  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ml_research_consents
  FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.propagation_attempts
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.propagation_outcomes
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ml_research_consents
  TO service_role;

COMMENT ON COLUMN public.ml_research_consents.retention_acknowledged_at IS
  'Explicit acknowledgement of the policy-version retention and publication terms.';

-- Preregistered beta evidence, retention, and privacy boundary.
-- Collection remains independently disabled by the product and model services.

ALTER TABLE public.propagation_predictions
  ADD COLUMN IF NOT EXISTS profile text NOT NULL DEFAULT 'physics',
  ADD COLUMN IF NOT EXISTS station_tx_class text,
  ADD COLUMN IF NOT EXISTS station_loss_class text,
  ADD COLUMN IF NOT EXISTS station_antenna_class text,
  ADD COLUMN IF NOT EXISTS station_rx_class text,
  ADD COLUMN IF NOT EXISTS station_supported boolean;

ALTER TABLE public.propagation_predictions
  ALTER COLUMN station_tx_class DROP NOT NULL,
  ALTER COLUMN station_tx_class DROP DEFAULT,
  ALTER COLUMN station_loss_class DROP NOT NULL,
  ALTER COLUMN station_loss_class DROP DEFAULT,
  ALTER COLUMN station_antenna_class DROP NOT NULL,
  ALTER COLUMN station_antenna_class DROP DEFAULT,
  ALTER COLUMN station_rx_class DROP NOT NULL,
  ALTER COLUMN station_rx_class DROP DEFAULT,
  ALTER COLUMN station_supported DROP NOT NULL,
  ALTER COLUMN station_supported DROP DEFAULT;

ALTER TABLE public.propagation_predictions
  DROP CONSTRAINT IF EXISTS propagation_predictions_profile_check,
  DROP CONSTRAINT IF EXISTS propagation_predictions_station_tx_class_check,
  DROP CONSTRAINT IF EXISTS propagation_predictions_station_loss_class_check,
  DROP CONSTRAINT IF EXISTS propagation_predictions_station_antenna_class_check,
  DROP CONSTRAINT IF EXISTS propagation_predictions_station_rx_class_check;

ALTER TABLE public.propagation_predictions
  ADD CONSTRAINT propagation_predictions_profile_check
    CHECK (profile IN ('physics', 'nowcast')) NOT VALID,
  ADD CONSTRAINT propagation_predictions_station_tx_class_check
    CHECK (station_tx_class IS NULL OR station_tx_class IN (
      'unknown', 'lt_1w', '1_5w', '5_25w', '25_100w', '100_500w', 'ge_500w'
    )) NOT VALID,
  ADD CONSTRAINT propagation_predictions_station_loss_class_check
    CHECK (station_loss_class IS NULL OR station_loss_class IN (
      'unknown', 'lt_1db', '1_3db', '3_6db', 'ge_6db'
    )) NOT VALID,
  ADD CONSTRAINT propagation_predictions_station_antenna_class_check
    CHECK (station_antenna_class IS NULL OR station_antenna_class IN (
      'unknown', 'lt_0dbi', '0_3dbi', '3_6dbi', '6_10dbi', 'ge_10dbi'
    )) NOT VALID,
  ADD CONSTRAINT propagation_predictions_station_rx_class_check
    CHECK (station_rx_class IS NULL OR station_rx_class IN (
      'unknown', 'relative', 'catalog', 'measured'
    )) NOT VALID;

ALTER TABLE public.propagation_predictions
  VALIDATE CONSTRAINT propagation_predictions_profile_check,
  VALIDATE CONSTRAINT propagation_predictions_station_tx_class_check,
  VALIDATE CONSTRAINT propagation_predictions_station_loss_class_check,
  VALIDATE CONSTRAINT propagation_predictions_station_antenna_class_check,
  VALIDATE CONSTRAINT propagation_predictions_station_rx_class_check;

REVOKE INSERT, UPDATE ON public.propagation_predictions
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.propagation_predictions
  TO service_role;

-- Fail closed if an older or partial row lacks the explicit retention
-- acknowledgement required by this protocol version.
UPDATE public.ml_research_consents
SET
  status = 'withdrawn',
  allowed_uses = ARRAY[]::text[],
  consented_at = NULL,
  withdrawn_at = now(),
  retention_until = now(),
  retention_acknowledged_at = coalesce(retention_acknowledged_at, now()),
  updated_at = now()
WHERE status = 'opted_in'
  AND (
    consented_at IS NULL
    OR retention_acknowledged_at IS NULL
    OR retention_until IS NULL
    OR retention_until <= consented_at
    OR retention_until > consented_at + interval '730 days'
  );

UPDATE public.ml_research_consents
SET
  allowed_uses = ARRAY[]::text[],
  consented_at = NULL,
  withdrawn_at = coalesce(withdrawn_at, now()),
  retention_until = coalesce(withdrawn_at, now()),
  retention_acknowledged_at = coalesce(retention_acknowledged_at, withdrawn_at, now()),
  updated_at = now()
WHERE status = 'withdrawn';

DELETE FROM public.propagation_outcomes AS outcome
USING public.ml_research_consents AS consent
WHERE outcome.user_id = consent.user_id
  AND (consent.status = 'withdrawn' OR consent.retention_until <= now());
DELETE FROM public.propagation_attempts AS attempt
USING public.ml_research_consents AS consent
WHERE attempt.user_id = consent.user_id
  AND (consent.status = 'withdrawn' OR consent.retention_until <= now());
DELETE FROM public.propagation_predictions AS prediction
USING public.ml_research_consents AS consent
WHERE prediction.user_id = consent.user_id
  AND (consent.status = 'withdrawn' OR consent.retention_until <= now());

ALTER TABLE public.ml_research_consents
  DROP CONSTRAINT IF EXISTS ml_research_consents_retention_check;
ALTER TABLE public.ml_research_consents
  ADD CONSTRAINT ml_research_consents_retention_check CHECK (
    retention_until IS NOT NULL
    AND retention_acknowledged_at IS NOT NULL
    AND (
      (status = 'opted_in'
        AND retention_until > consented_at
        AND retention_until <= consented_at + interval '730 days')
      OR (status = 'withdrawn' AND retention_until <= withdrawn_at)
    )
  ) NOT VALID;

ALTER TABLE public.ml_research_consents
  VALIDATE CONSTRAINT ml_research_consents_retention_check;

CREATE INDEX IF NOT EXISTS propagation_predictions_beta_window_idx
  ON public.propagation_predictions (issue_time, profile, band, mode)
  WHERE sampled_for_research;
CREATE INDEX IF NOT EXISTS propagation_outcomes_beta_window_idx
  ON public.propagation_outcomes (observed_at, evidence_grade, outcome_type);

CREATE OR REPLACE FUNCTION public.set_propagation_research_consent(
  p_user_id uuid,
  p_policy_version text,
  p_allowed_uses text[],
  p_now timestamptz
)
RETURNS TABLE (
  policy_version text,
  status text,
  allowed_uses text[],
  consented_at timestamptz,
  withdrawn_at timestamptz,
  retention_acknowledged_at timestamptz,
  retention_until timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_uses text[];
BEGIN
  IF p_user_id IS NULL OR p_policy_version IS NULL OR btrim(p_policy_version) = ''
     OR p_allowed_uses IS NULL OR p_now IS NULL THEN
    RAISE EXCEPTION 'invalid research consent';
  END IF;

  SELECT coalesce(
    array_agg(DISTINCT allowed_use ORDER BY allowed_use),
    ARRAY[]::text[]
  )
  INTO normalized_uses
  FROM unnest(p_allowed_uses) AS requested(allowed_use);

  IF cardinality(normalized_uses) < 1 OR cardinality(normalized_uses) > 4
     OR NOT normalized_uses <@ ARRAY[
       'anonymous_quality_metrics',
       'derived_equipment_training',
       'attempt_outcome_training',
       'research_follow_up'
     ]::text[] THEN
    RAISE EXCEPTION 'invalid research allowed uses';
  END IF;

  INSERT INTO public.ml_research_consents AS consent (
    user_id,
    policy_version,
    status,
    allowed_uses,
    consented_at,
    withdrawn_at,
    retention_until,
    retention_acknowledged_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_policy_version,
    'opted_in',
    normalized_uses,
    p_now,
    NULL,
    p_now + interval '730 days',
    p_now,
    p_now
  )
  ON CONFLICT (user_id) DO UPDATE SET
    policy_version = excluded.policy_version,
    status = 'opted_in',
    allowed_uses = excluded.allowed_uses,
    consented_at = p_now,
    withdrawn_at = NULL,
    retention_until = p_now + interval '730 days',
    retention_acknowledged_at = p_now,
    updated_at = p_now;

  IF NOT 'attempt_outcome_training' = ANY(normalized_uses) THEN
    DELETE FROM public.propagation_outcomes WHERE user_id = p_user_id;
    DELETE FROM public.propagation_attempts WHERE user_id = p_user_id;
    DELETE FROM public.propagation_predictions WHERE user_id = p_user_id;
  ELSIF NOT 'derived_equipment_training' = ANY(normalized_uses) THEN
    UPDATE public.propagation_predictions
    SET
      station_tx_class = NULL,
      station_loss_class = NULL,
      station_antenna_class = NULL,
      station_rx_class = NULL
    WHERE user_id = p_user_id;
  END IF;

  RETURN QUERY
  SELECT
    consent.policy_version,
    consent.status,
    consent.allowed_uses,
    consent.consented_at,
    consent.withdrawn_at,
    consent.retention_acknowledged_at,
    consent.retention_until,
    consent.updated_at
  FROM public.ml_research_consents AS consent
  WHERE consent.user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_propagation_research_consent(
  p_user_id uuid,
  p_policy_version text,
  p_now timestamptz
)
RETURNS TABLE (
  policy_version text,
  status text,
  allowed_uses text[],
  consented_at timestamptz,
  withdrawn_at timestamptz,
  retention_acknowledged_at timestamptz,
  retention_until timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_policy_version IS NULL OR btrim(p_policy_version) = ''
     OR p_now IS NULL THEN
    RAISE EXCEPTION 'invalid research withdrawal';
  END IF;

  INSERT INTO public.ml_research_consents AS consent (
    user_id,
    policy_version,
    status,
    allowed_uses,
    consented_at,
    withdrawn_at,
    retention_until,
    retention_acknowledged_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_policy_version,
    'withdrawn',
    ARRAY[]::text[],
    NULL,
    p_now,
    p_now,
    p_now,
    p_now
  )
  ON CONFLICT (user_id) DO UPDATE SET
    policy_version = excluded.policy_version,
    status = 'withdrawn',
    allowed_uses = ARRAY[]::text[],
    consented_at = NULL,
    withdrawn_at = p_now,
    retention_until = p_now,
    retention_acknowledged_at = coalesce(
      consent.retention_acknowledged_at,
      p_now
    ),
    updated_at = p_now;

  DELETE FROM public.propagation_outcomes WHERE user_id = p_user_id;
  DELETE FROM public.propagation_attempts WHERE user_id = p_user_id;
  DELETE FROM public.propagation_predictions WHERE user_id = p_user_id;

  RETURN QUERY
  SELECT
    consent.policy_version,
    consent.status,
    consent.allowed_uses,
    consent.consented_at,
    consent.withdrawn_at,
    consent.retention_acknowledged_at,
    consent.retention_until,
    consent.updated_at
  FROM public.ml_research_consents AS consent
  WHERE consent.user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_expired_propagation_research_data(
  p_now timestamptz,
  p_limit_participants integer DEFAULT 1000
)
RETURNS TABLE (
  participants_selected integer,
  outcomes_deleted bigint,
  attempts_deleted bigint,
  predictions_deleted bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  selected_ids uuid[];
  outcome_count bigint := 0;
  attempt_count bigint := 0;
  prediction_count bigint := 0;
BEGIN
  IF p_now IS NULL OR p_limit_participants < 1 OR p_limit_participants > 10000 THEN
    RAISE EXCEPTION 'invalid research retention request';
  END IF;

  SELECT coalesce(array_agg(candidate.user_id), ARRAY[]::uuid[])
  INTO selected_ids
  FROM (
    SELECT consent.user_id
    FROM public.ml_research_consents AS consent
    WHERE consent.retention_until <= p_now
      AND (
        EXISTS (
          SELECT 1 FROM public.propagation_predictions AS prediction
          WHERE prediction.user_id = consent.user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.propagation_attempts AS attempt
          WHERE attempt.user_id = consent.user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.propagation_outcomes AS outcome
          WHERE outcome.user_id = consent.user_id
        )
      )
    ORDER BY consent.retention_until, consent.user_id
    LIMIT p_limit_participants
    FOR UPDATE SKIP LOCKED
  ) AS candidate;

  DELETE FROM public.propagation_outcomes
  WHERE user_id = ANY(selected_ids);
  GET DIAGNOSTICS outcome_count = ROW_COUNT;
  DELETE FROM public.propagation_attempts
  WHERE user_id = ANY(selected_ids);
  GET DIAGNOSTICS attempt_count = ROW_COUNT;
  DELETE FROM public.propagation_predictions
  WHERE user_id = ANY(selected_ids);
  GET DIAGNOSTICS prediction_count = ROW_COUNT;

  RETURN QUERY SELECT
    cardinality(selected_ids),
    outcome_count,
    attempt_count,
    prediction_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_propagation_beta_evidence(
  p_policy_version text,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_min_participants integer DEFAULT 5,
  p_min_outcomes integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF p_policy_version IS NULL OR btrim(p_policy_version) = ''
     OR p_window_start IS NULL OR p_window_end IS NULL
     OR p_window_end <= p_window_start
     OR p_window_end - p_window_start > interval '180 days'
     OR p_min_participants < 5 OR p_min_participants > 100
     OR p_min_outcomes < 20 OR p_min_outcomes > 10000 THEN
    RAISE EXCEPTION 'invalid beta evidence request';
  END IF;

  WITH eligible AS (
    SELECT
      prediction.user_id,
      prediction.band,
      prediction.mode,
      left(prediction.origin_grid4, 2) AS origin_field,
      CASE WHEN 'derived_equipment_training' = ANY(consent.allowed_uses)
        THEN prediction.station_tx_class END AS station_tx_class,
      CASE WHEN 'derived_equipment_training' = ANY(consent.allowed_uses)
        THEN prediction.station_loss_class END AS station_loss_class,
      CASE WHEN 'derived_equipment_training' = ANY(consent.allowed_uses)
        THEN prediction.station_antenna_class END AS station_antenna_class,
      CASE WHEN 'derived_equipment_training' = ANY(consent.allowed_uses)
        THEN prediction.station_rx_class END AS station_rx_class,
      CASE WHEN 'derived_equipment_training' = ANY(consent.allowed_uses)
        THEN prediction.station_supported END AS station_supported,
      CASE
        WHEN outcome.outcome_type LIKE 'receive_%' THEN 'receive'
        ELSE 'contact'
      END AS task,
      outcome.evidence_grade,
      CASE
        WHEN outcome.evidence_grade IN ('bridge', 'wsjtx') THEN 'A'
        WHEN outcome.evidence_grade IN ('rig', 'logbook') THEN 'B'
        ELSE 'C'
      END AS evidence_tier,
      CASE
        WHEN outcome.outcome_type IN ('receive_success', 'contact_success') THEN 1.0
        WHEN outcome.outcome_type IN ('receive_failure', 'contact_failure') THEN 0.0
      END AS observed,
      prediction.core_probability::double precision AS core_probability,
      prediction.personalized_probability::double precision AS personalized_probability
    FROM public.propagation_outcomes AS outcome
    JOIN public.propagation_attempts AS attempt
      ON attempt.id = outcome.attempt_id AND attempt.user_id = outcome.user_id
    JOIN public.propagation_predictions AS prediction
      ON prediction.id = attempt.prediction_id AND prediction.user_id = attempt.user_id
    JOIN public.ml_research_consents AS consent
      ON consent.user_id = prediction.user_id
    WHERE outcome.observed_at >= p_window_start
      AND outcome.observed_at < p_window_end
      AND outcome.outcome_type IN (
        'receive_success', 'receive_failure', 'contact_success', 'contact_failure'
      )
      AND prediction.sampled_for_research
      AND prediction.profile = 'nowcast'
      AND cardinality(prediction.ood_flags) = 0
      AND prediction.personalized_probability IS NOT NULL
      AND prediction.station_supported IS TRUE
      AND consent.policy_version = p_policy_version
      AND consent.status = 'opted_in'
      AND consent.retention_until > p_window_end
      AND 'attempt_outcome_training' = ANY(consent.allowed_uses)
  ),
  primary_eligible AS (
    SELECT *
    FROM eligible
    WHERE mode = 'WSPR' AND task = 'receive'
  ),
  participant_counts AS (
    SELECT user_id, count(*)::bigint AS outcomes
    FROM primary_eligible
    GROUP BY user_id
  ),
  summary AS (
    SELECT
      (
        count(DISTINCT user_id) >= p_min_participants
        AND count(*) >= p_min_outcomes
      ) AS reportable,
      count(DISTINCT user_id)::integer AS participants,
      count(*)::bigint AS outcomes,
      count(*) FILTER (WHERE evidence_tier = 'A')::bigint AS tier_a_outcomes,
      avg((core_probability - observed) ^ 2) AS core_brier,
      avg((personalized_probability - observed) ^ 2) AS personalized_brier
    FROM primary_eligible
  ),
  dimensions AS (
    SELECT
      primary_eligible.*,
      dimension.name AS dimension,
      dimension.value AS value
    FROM primary_eligible
    CROSS JOIN LATERAL (VALUES
      ('band', primary_eligible.band),
      ('origin_field', primary_eligible.origin_field),
      ('tx_eirp', primary_eligible.station_tx_class),
      ('passive_loss', primary_eligible.station_loss_class),
      ('directional_gain', primary_eligible.station_antenna_class),
      ('receiver_evidence', primary_eligible.station_rx_class),
      ('evidence_tier', primary_eligible.evidence_tier)
    ) AS dimension(name, value)
    WHERE dimension.value IS NOT NULL
  ),
  strata AS (
    SELECT
      dimension,
      value,
      count(DISTINCT user_id)::integer AS participants,
      count(*)::bigint AS outcomes,
      avg((core_probability - observed) ^ 2) AS core_brier,
      avg((personalized_probability - observed) ^ 2) AS personalized_brier
    FROM dimensions
    GROUP BY dimension, value
    HAVING count(DISTINCT user_id) >= p_min_participants
       AND count(*) >= p_min_outcomes
  ),
  calibration AS (
    SELECT
      model,
      least(9, floor(probability * 10)::integer) AS bin,
      count(*)::bigint AS outcomes,
      avg(probability) AS mean_probability,
      avg(observed) AS observed_rate
    FROM primary_eligible
    CROSS JOIN LATERAL (VALUES
      ('core', primary_eligible.core_probability),
      ('stationcast', primary_eligible.personalized_probability)
    ) AS model_probability(model, probability)
    GROUP BY model, least(9, floor(probability * 10)::integer)
    HAVING count(DISTINCT primary_eligible.user_id) >= p_min_participants
       AND count(*) >= p_min_outcomes
  )
  SELECT jsonb_build_object(
    'schema_version', 1,
    'policy_version', p_policy_version,
    'window_start', p_window_start,
    'window_end', p_window_end,
    'scope', 'privacy_bounded_wspr_reception_monitoring_not_promotion_score',
    'reportability', jsonb_build_object(
      'minimum_participants', p_min_participants,
      'minimum_outcomes', p_min_outcomes
    ),
    'summary', CASE WHEN summary.reportable THEN jsonb_build_object(
        'reportable', true,
        'participants', summary.participants,
        'outcomes', summary.outcomes,
        'tier_a_outcomes', summary.tier_a_outcomes,
        'core_brier', summary.core_brier,
        'stationcast_brier', summary.personalized_brier,
        'paired_brier_delta', summary.personalized_brier - summary.core_brier,
        'largest_participant_share', (
          SELECT max(participant_counts.outcomes)::double precision
            / nullif(sum(participant_counts.outcomes), 0)
          FROM participant_counts
        )
      ) ELSE jsonb_build_object('reportable', false) END,
    'strata', coalesce((
      SELECT jsonb_agg(to_jsonb(strata) ORDER BY strata.dimension, strata.value)
      FROM strata
    ), '[]'::jsonb),
    'calibration_bins', coalesce((
      SELECT jsonb_agg(to_jsonb(calibration) ORDER BY calibration.model, calibration.bin)
      FROM calibration
    ), '[]'::jsonb),
    'privacy', jsonb_build_object(
      'user_ids_returned', false,
      'exact_grid4_returned', false,
      'raw_station_inventory_returned', false,
      'participant_cap_applied', false
    )
  )
  INTO result
  FROM summary;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_propagation_research_consent(
  uuid, text, text[], timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.withdraw_propagation_research_consent(
  uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_expired_propagation_research_data(
  timestamptz, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_propagation_beta_evidence(
  text, timestamptz, timestamptz, integer, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_propagation_research_consent(
  uuid, text, text[], timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_propagation_research_consent(
  uuid, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_expired_propagation_research_data(
  timestamptz, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_propagation_beta_evidence(
  text, timestamptz, timestamptz, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.set_propagation_research_consent(
  uuid, text, text[], timestamptz
) IS 'Atomically records versioned consent and scrubs equipment classes when that independent use is absent.';
COMMENT ON FUNCTION public.withdraw_propagation_research_consent(
  uuid, text, timestamptz
) IS 'Atomically withdraws consent and deletes retained account-bound research rows.';
COMMENT ON FUNCTION public.prune_expired_propagation_research_data(
  timestamptz, integer
) IS 'Deletes expired account-bound research rows in a bounded service-role batch.';
COMMENT ON FUNCTION public.get_propagation_beta_evidence(
  text, timestamptz, timestamptz, integer, integer
) IS 'Returns only k-anonymous aggregate beta evidence; never user IDs, exact grid4, or raw shack data.';

COMMENT ON COLUMN public.propagation_predictions.station_tx_class IS
  'Nullable consent-gated path-EIRP class; exact power and raw equipment are prohibited.';
COMMENT ON COLUMN public.propagation_predictions.station_loss_class IS
  'Nullable consent-gated passive-loss class; exact loss and raw equipment are prohibited.';
COMMENT ON COLUMN public.propagation_predictions.station_antenna_class IS
  'Nullable consent-gated directional-gain class; exact gain and raw equipment are prohibited.';
COMMENT ON COLUMN public.propagation_predictions.station_rx_class IS
  'Nullable consent-gated receiver-evidence class; exact noise and raw equipment are prohibited.';
COMMENT ON COLUMN public.propagation_predictions.station_supported IS
  'Signed server support decision; raw equipment is prohibited and unsupported chains cannot enter StationCast beta evidence.';

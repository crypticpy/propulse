\set ON_ERROR_STOP on

BEGIN;

INSERT INTO public.propagation_model_versions (
  id, model_family, status, feature_schema, artifact_sha256,
  training_manifest_uri, license_spdx
) VALUES (
  'retention-integration-v1', 'fixture', 'research', 'fixture-v1',
  repeat('a', 64), 'private://fixture/manifest', 'LicenseRef-Private'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) VALUES
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'withdrawal-fixture@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'expiry-fixture@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now());

DO $$
DECLARE
  fixture_user uuid;
  prediction_id uuid;
  attempt_id uuid;
  result record;
BEGIN
  FOREACH fixture_user IN ARRAY ARRAY[
    '10000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid
  ] LOOP
    PERFORM * FROM public.set_propagation_research_consent(
      fixture_user,
      'retention-integration-v1',
      ARRAY['attempt_outcome_training', 'derived_equipment_training'],
      CASE fixture_user
        WHEN '10000000-0000-0000-0000-000000000001'::uuid
          THEN '2026-01-01 00:00Z'::timestamptz
        ELSE '2024-01-01 00:00Z'::timestamptz
      END
    );
    INSERT INTO public.propagation_predictions (
      user_id, model_version, feature_contract, chain_fingerprint,
      origin_grid4, target_grid4, issue_time, valid_time, band, mode,
      declared_power_watts, core_probability, personalized_probability,
      confidence, sampled_for_research, profile,
      station_tx_class, station_loss_class, station_antenna_class,
      station_rx_class, station_supported
    ) VALUES (
      fixture_user, 'retention-integration-v1', 'fixture-v1', repeat('f', 64),
      'FN20', 'EM10', '2026-01-01 00:00Z', '2026-01-01 01:00Z',
      '20m', 'FT8', 50, 0.5, 0.6, 0.8, true, 'nowcast',
      '25_100w', '1_3db', '0_3dbi', 'catalog', true
    ) RETURNING id INTO prediction_id;
    INSERT INTO public.propagation_attempts (
      user_id, prediction_id, started_at, ended_at, band, mode,
      declared_power_watts, origin_grid4, target_grid4,
      chain_fingerprint, evidence_grade
    ) VALUES (
      fixture_user, prediction_id, '2026-01-01 00:10Z',
      '2026-01-01 00:20Z', '20m', 'FT8', 50, 'FN20', 'EM10',
      repeat('f', 64), 'manual'
    ) RETURNING id INTO attempt_id;
    INSERT INTO public.propagation_outcomes (
      user_id, attempt_id, outcome_type, evidence_grade, observed_at
    ) VALUES (
      fixture_user, attempt_id, 'contact_success', 'manual',
      '2026-01-01 00:20Z'
    );
  END LOOP;

  PERFORM * FROM public.withdraw_propagation_research_consent(
    '10000000-0000-0000-0000-000000000001',
    'retention-integration-v1', '2026-01-02 00:00Z'
  );
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.propagation_predictions
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
  );
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.propagation_attempts
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
  );
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.propagation_outcomes
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
  );
  ASSERT (
    SELECT status = 'withdrawn'
      AND retention_until = withdrawn_at
      AND cardinality(allowed_uses) = 0
    FROM public.ml_research_consents
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
  );

  SELECT * INTO result
  FROM public.prune_expired_propagation_research_data(
    '2026-01-02 00:00Z', 1000
  );
  ASSERT result.participants_selected = 1;
  ASSERT result.predictions_deleted = 1;
  ASSERT result.attempts_deleted = 1;
  ASSERT result.outcomes_deleted = 1;
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.propagation_predictions
    WHERE user_id = '10000000-0000-0000-0000-000000000002'
  );
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.propagation_attempts
    WHERE user_id = '10000000-0000-0000-0000-000000000002'
  );
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.propagation_outcomes
    WHERE user_id = '10000000-0000-0000-0000-000000000002'
  );
END;
$$;

DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.propagation_archive_datasets
    WHERE source_relation IN (
      'public.propagation_predictions',
      'public.propagation_attempts',
      'public.propagation_outcomes',
      'public.ml_research_consents'
    )
  );
END;
$$;

ROLLBACK;

\echo 'research withdrawal and expiry integration: passed'

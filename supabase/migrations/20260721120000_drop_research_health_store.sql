-- Drop the NowCast research-health heartbeat store.
--
-- It existed solely so the hourly M5 WSPR research pipeline could report
-- freshness to the app's system-health view. That pipeline is decommissioned
-- (see 20260721110000_drop_wspr_live_pipeline.sql) and the reporting
-- endpoints are removed from the repo, so the store and its RPCs are dead.
-- The consent-scoped research apparatus (ml_research_consents,
-- set/withdraw_propagation_research_consent,
-- prune_expired_propagation_research_data) is unrelated and stays.

DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'record_propagation_research_health',
        'claim_propagation_research_alerts',
        'complete_propagation_research_alert_attempt',
        'monitor_propagation_research_health',
        'propagation_research_alert_names_valid'
      )
  LOOP
    EXECUTE format('DROP FUNCTION %s CASCADE', fn.signature);
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.propagation_research_health CASCADE;
DROP TABLE IF EXISTS public.propagation_research_alert_outbox CASCADE;

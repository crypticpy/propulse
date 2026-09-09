DO $$ DECLARE b record; a record; BEGIN
 SELECT * INTO b FROM public.recency_function_before;
 SELECT p.proowner,p.proacl,p.proconfig,p.proargdefaults::text AS proargdefaults,p.pronargdefaults INTO a FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='compute_path_recency_hourly' AND p.proargtypes='1184 25'::oidvector;
 IF b IS DISTINCT FROM a THEN RAISE EXCEPTION 'function metadata changed'; END IF;
 IF pg_get_userbyid(a.proowner)<>'postgres' OR a.pronargdefaults<>1 THEN RAISE EXCEPTION 'owner/default changed'; END IF;
 IF has_function_privilege('anon','public.compute_path_recency_hourly(timestamptz,text)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.compute_path_recency_hourly(timestamptz,text)','EXECUTE') THEN RAISE EXCEPTION 'ACL changed'; END IF;
END $$;

INSERT INTO public.path_hourly_stats(hour_utc,band,mode_class,tx_field,rx_field,spot_count) VALUES
 ('2026-05-01T01:00Z','20m','digital','AA','BB',2),('2026-05-01T01:00Z','20m','cw','CC','BB',3),
 ('2026-05-01T01:00Z','20m','digital','DD','EE',4),('2026-05-01T01:00Z','6m','digital','FF','GG',8);
SET timezone='Asia/Kolkata';
DO $$ DECLARE n int; has_q boolean; BEGIN
 n:=public.compute_path_recency_hourly('2026-05-01T01:00Z');
 IF n<>3 OR EXISTS(SELECT 1 FROM public.path_recency_hourly WHERE transform_version<>'psk-rbn-field-recency-v2'
  OR source_watermark<>'2026-05-01T02:00Z' OR exposure NOT IN(1,2)
  OR abs(recency_rate-(1::double precision/exposure))>1e-12) THEN RAISE EXCEPTION 'algorithm/default/UTC changed'; END IF;
 SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='path_recency_hourly' AND column_name='recency_quantile') INTO has_q;
 IF has_q THEN
  EXECUTE 'SELECT count(*) FILTER(WHERE recency_quantile=0)=2 AND count(*) FILTER(WHERE recency_quantile=1)=1 FROM public.path_recency_hourly' INTO has_q;
  has_q:=NOT has_q;
  IF has_q THEN RAISE EXCEPTION 'quantile changed'; END IF;
 END IF;
END $$;
RESET timezone;

DO $$ DECLARE v text; BEGIN
 BEGIN PERFORM public.compute_path_recency_hourly(NULL); RAISE EXCEPTION 'null hour accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'hour is required' THEN RAISE; END IF; END;
 BEGIN PERFORM public.compute_path_recency_hourly('infinity'); RAISE EXCEPTION 'positive infinity accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'hour infinity is not complete yet' THEN RAISE; END IF; END;
 FOREACH v IN ARRAY ARRAY['-infinity','2026-05-01T01:30Z'] LOOP
  BEGIN PERFORM public.compute_path_recency_hourly(v::timestamptz); RAISE EXCEPTION 'invalid hour accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'path recency hour must be a finite UTC-aligned whole hour' THEN RAISE; END IF; END;
 END LOOP;
 BEGIN PERFORM public.compute_path_recency_hourly('2999-01-01'); RAISE EXCEPTION 'future accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'hour % is not complete yet' THEN RAISE; END IF; END;
 BEGIN PERFORM public.compute_path_recency_hourly('2026-05-01T01:00Z',''); RAISE EXCEPTION 'transform accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'invalid transform version' THEN RAISE; END IF; END;
END $$;

SELECT public.record_spot_aggregation_gap('path_hourly','2026-05-01T00:00Z','2026-05-01T01:00Z');
DO $$ DECLARE n int; BEGIN
 SELECT count(*) INTO n FROM public.path_recency_hourly WHERE hour_utc='2026-05-01T01:00Z';
 BEGIN PERFORM public.compute_path_recency_hourly('2026-05-01T01:00Z'); RAISE EXCEPTION 'inclusive gap accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'path recency source hour is a known aggregation gap' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM public.path_recency_hourly WHERE hour_utc='2026-05-01T01:00Z')<>n THEN RAISE EXCEPTION 'gap changed rows'; END IF;
 BEGIN PERFORM public.compute_path_recency_hourly('2026-05-01T00:00Z'); RAISE EXCEPTION 'inclusive start gap accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'path recency source hour is a known aggregation gap' THEN RAISE; END IF; END;
END $$;

INSERT INTO public.path_hourly_stats(hour_utc,band,mode_class,tx_field,rx_field,spot_count) VALUES('2026-05-02T01:00Z','20m','digital','AA','BB',1);
SELECT public.compute_path_recency_hourly('2026-05-02T01:00Z','rollback');
INSERT INTO public.path_hourly_stats(hour_utc,band,mode_class,tx_field,rx_field,spot_count) VALUES('2026-05-02T01:00Z','20m','cw','AA','BB',2147483647);
DO $$ BEGIN
 BEGIN PERFORM public.compute_path_recency_hourly('2026-05-02T01:00Z','rollback'); RAISE EXCEPTION 'overflow accepted';
 EXCEPTION WHEN numeric_value_out_of_range THEN NULL; END;
 IF (SELECT count(*) FROM public.path_recency_hourly WHERE hour_utc='2026-05-02T01:00Z' AND transform_version='rollback')<>1 THEN RAISE EXCEPTION 'DELETE not rolled back'; END IF;
END $$;

SET ROLE service_role; SELECT public.compute_path_recency_hourly('2026-05-03T01:00Z'); RESET ROLE;
SET ROLE anon;
DO $$ BEGIN BEGIN PERFORM public.compute_path_recency_hourly('2026-05-03T01:00Z'); RAISE EXCEPTION 'anon accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $$ BEGIN BEGIN PERFORM public.compute_path_recency_hourly('2026-05-03T01:00Z'); RAISE EXCEPTION 'RR accepted';
EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'path recency recovery requires read committed isolation' THEN RAISE; END IF; END; END $$;
ROLLBACK;

CREATE FUNCTION public.recency_test_late_gap() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 PERFORM public.record_spot_aggregation_gap('path_hourly','2026-05-04T01:00Z','2026-05-04T01:00Z'); PERFORM pg_sleep(1); END $$;
SELECT dblink_connect('recency_gap','host=/tmp dbname=postgres user=postgres');
SELECT dblink_send_query('recency_gap','SELECT public.recency_test_late_gap()'); SELECT pg_sleep(0.2);
DO $$ DECLARE started timestamptz:=clock_timestamp(); BEGIN
 BEGIN PERFORM public.compute_path_recency_hourly('2026-05-04T01:00Z'); RAISE EXCEPTION 'late gap accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'path recency source hour is a known aggregation gap' THEN RAISE; END IF; END;
 IF clock_timestamp()-started<interval '0.65 seconds' THEN RAISE EXCEPTION 'did not wait'; END IF;
END $$;
SELECT result FROM dblink_get_result('recency_gap') AS t(result text); SELECT dblink_disconnect('recency_gap');

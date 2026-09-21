-- Parent-run ONLY after V45/V46 on DEV. Run with psql -v ON_ERROR_STOP=1.
-- Every fixture is inside this transaction; no shared data survives ROLLBACK.
BEGIN;
DO $$
DECLARE
 owner_id uuid := gen_random_uuid(); other_owner uuid := gen_random_uuid();
 p uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); p3 uuid := gen_random_uuid();
 actual_id uuid := gen_random_uuid(); next_actual uuid := gen_random_uuid(); historical_id uuid := gen_random_uuid();
 actual_start timestamptz := date_trunc('day',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul' + interval '9 hours 17 minutes 13 seconds';
BEGIN
 INSERT INTO auth.users(id) VALUES(owner_id),(other_owner);
 INSERT INTO planned_time_blocks(id,user_id,domain_type,title,start_at,end_at,plan_date)
 VALUES(p,owner_id,'LIFE','execution fixture',actual_start-interval '1 hour',actual_start,(actual_start AT TIME ZONE 'Asia/Seoul')::date),
       (p2,owner_id,'LIFE','unscheduled fixture',null,null,(actual_start AT TIME ZONE 'Asia/Seoul')::date),
       (p3,owner_id,'LIFE','historical fixture',actual_start-interval '2 hours',actual_start-interval '1 hour',(actual_start AT TIME ZONE 'Asia/Seoul')::date);
 INSERT INTO life_time_entries(id,user_id,entry_date,title,duration_minutes,execution_start_at)
 VALUES(actual_id,owner_id,(actual_start AT TIME ZONE 'Asia/Seoul')::date,'running source',0,actual_start);
 INSERT INTO calendar_plan_executions(plan_id,user_id,life_id,running) VALUES(p,owner_id,actual_id,true);
 IF (SELECT start_at FROM planned_time_blocks WHERE id=p)<>actual_start-interval '1 hour' THEN RAISE EXCEPTION 'Plan changed'; END IF;
 INSERT INTO life_time_entries(id,user_id,entry_date,title,duration_minutes,execution_start_at) VALUES(next_actual,owner_id,(actual_start AT TIME ZONE 'Asia/Seoul')::date,'second running source',0,actual_start);
 BEGIN
  INSERT INTO calendar_plan_executions(plan_id,user_id,life_id,running) VALUES(p2,owner_id,next_actual,true);
  RAISE EXCEPTION 'Expected unique/single-running failure';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN DELETE FROM planned_time_blocks WHERE id=p; RAISE EXCEPTION 'running Plan delete was not guarded';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE '%종료%' THEN RAISE; END IF; END;
 DELETE FROM life_time_entries WHERE id=next_actual;
 -- Source ownership and duration are enforced in PostgreSQL.
 INSERT INTO life_time_entries(id,user_id,entry_date,title,duration_minutes) VALUES(next_actual,other_owner,(actual_start AT TIME ZONE 'Asia/Seoul')::date,'foreign source',60);
 BEGIN INSERT INTO calendar_plan_executions(plan_id,user_id,life_id,running) VALUES(p2,owner_id,next_actual,false); RAISE EXCEPTION 'foreign source link accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 UPDATE life_time_entries SET start_at=execution_start_at,end_at=execution_start_at+interval '1 minute 7 seconds',duration_minutes=1,execution_start_at=null WHERE id=actual_id;
 UPDATE calendar_plan_executions SET running=false WHERE plan_id=p;
 IF (SELECT end_at-start_at FROM life_time_entries WHERE id=actual_id)<>interval '1 minute 7 seconds' THEN RAISE EXCEPTION 'Real timing lost'; END IF;
 BEGIN INSERT INTO calendar_plan_executions(plan_id,user_id,life_id,running) VALUES(p,owner_id,next_actual,false); RAISE EXCEPTION 'second Actual on Plan accepted';
 EXCEPTION WHEN unique_violation OR foreign_key_violation THEN NULL; END;
 INSERT INTO life_time_entries(id,user_id,entry_date,title,duration_minutes,start_at,end_at) VALUES(historical_id,owner_id,(actual_start AT TIME ZONE 'Asia/Seoul')::date,'historical source',30,actual_start-interval '2 hours',actual_start-interval '90 minutes');
 INSERT INTO calendar_plan_executions(plan_id,user_id,life_id,running) VALUES(p3,owner_id,historical_id,false);
 -- A cancelled running source disappears while its unscheduled Plan survives.
 DELETE FROM life_time_entries WHERE id=next_actual;
 INSERT INTO life_time_entries(id,user_id,entry_date,title,duration_minutes,execution_start_at) VALUES(next_actual,owner_id,(actual_start AT TIME ZONE 'Asia/Seoul')::date,'cancel source',0,actual_start);
 INSERT INTO calendar_plan_executions(plan_id,user_id,life_id,running) VALUES(p2,owner_id,next_actual,true);
 DELETE FROM calendar_plan_executions WHERE plan_id=p2;
 DELETE FROM life_time_entries WHERE id=next_actual;
 IF NOT EXISTS(SELECT 1 FROM planned_time_blocks WHERE id=p2 AND start_at IS NULL AND end_at IS NULL) THEN RAISE EXCEPTION 'Cancel removed Plan'; END IF;
 -- Date-preserving unscheduled/timed conversions and rollback shape.
 UPDATE planned_time_blocks SET start_at=actual_start,end_at=actual_start+interval '1 hour' WHERE id=p2;
 UPDATE planned_time_blocks SET start_at=null,end_at=null WHERE id=p2;
 IF (SELECT plan_date FROM planned_time_blocks WHERE id=p2)<>(actual_start AT TIME ZONE 'Asia/Seoul')::date THEN RAISE EXCEPTION 'Unscheduled date lost'; END IF;
 RAISE NOTICE 'Calendar PostgreSQL lifecycle/ownership/unscheduled assertions passed';
END $$;
ROLLBACK;

CREATE OR REPLACE FUNCTION arcade_private.quizoria_endless_credit(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_endless_runs%rowtype;
 m arcade_private.quiz_reward_modes%rowtype;w public.arcade_wallets%rowtype;
 previous arcade_private.quizoria_endless_rewards%rowtype;
 xp int:=0; v_crowns int:=0;reason text:='below_threshold';hourly int:=0;daily int:=0;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 SELECT * INTO r FROM arcade_private.quizoria_endless_runs
 WHERE run_id=p_run_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND OR NOT r.finished THEN RAISE EXCEPTION 'run_not_finished';END IF;
 SELECT * INTO previous FROM arcade_private.quizoria_endless_rewards WHERE run_id=p_run_id;
 IF FOUND THEN
  RETURN pg_catalog.jsonb_build_object('xp',previous.xp,'crowns',previous.crowns,'reason',previous.reason);
 END IF;
 IF r.answered>=20 AND r.correct>=12 THEN
  xp:=15;
  IF r.answered>=50 AND r.correct>=30 THEN xp:=30;v_crowns:=1;END IF;
 END IF;
 -- Lock this player's wallet for serialized payout-limit checks.
 INSERT INTO public.arcade_wallets(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
 SELECT * INTO w FROM public.arcade_wallets WHERE user_id=uid FOR UPDATE;
 SELECT * INTO m FROM arcade_private.quiz_reward_modes WHERE user_id=uid FOR UPDATE;
 IF xp=0 THEN reason:='below_threshold';
 ELSIF NOT EXISTS(SELECT 1 FROM arcade_private.quiz_payout_release_gate
  WHERE gate_name='verified_rewards' AND enabled)
  OR m.user_id IS NULL OR m.enabled IS DISTINCT FROM true
  OR NOT EXISTS(SELECT 1 FROM arcade_private.quiz_reward_activation_audit
    WHERE user_id=uid AND activated_at=m.activated_at)
 THEN reason:='not_activated';
 ELSE
  SELECT count(*) FILTER (WHERE created_at>now()-interval '1 hour'),
   count(*) FILTER (WHERE (created_at AT TIME ZONE 'UTC')::date=
     (now() AT TIME ZONE 'UTC')::date)
  INTO hourly,daily FROM arcade_private.quizoria_endless_rewards
  WHERE user_id=uid AND arcade_private.quizoria_endless_rewards.xp>0;
  -- At most one funded Endless run per hour and two per UTC day.
  IF hourly>=1 OR daily>=2 THEN reason:='daily_limit';
  ELSIF w.crowns+v_crowns>1000000000 THEN reason:='wallet_limit';
  ELSE reason:='credited';END IF;
 END IF;
 IF reason<>'credited' THEN xp:=0;v_crowns:=0;END IF;
 INSERT INTO arcade_private.quizoria_endless_rewards(run_id,user_id,xp,crowns,shards,reason)
 VALUES(p_run_id,uid,xp,v_crowns,0,reason);
 IF reason='credited' THEN
  INSERT INTO public.arcade_profiles(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
  UPDATE public.arcade_profiles SET arcade_xp=arcade_xp+xp,updated_at=now() WHERE user_id=uid;
  UPDATE public.arcade_wallets SET crowns=crowns+v_crowns,updated_at=now() WHERE user_id=uid;
  UPDATE arcade_private.quiz_reward_modes SET verified_xp=verified_xp+xp,updated_at=now() WHERE user_id=uid;
  INSERT INTO public.arcade_wallet_events(operation_id,user_id,kind,details)
  VALUES(p_run_id,uid,'game_earnings',pg_catalog.jsonb_build_object(
   'source','quizoria-endless-v1','run_id',p_run_id,'xp',xp,'crowns',v_crowns,'shards',0));
 END IF;
 RETURN pg_catalog.jsonb_build_object('xp',xp,'crowns',v_crowns,'reason',reason);
END;
$fn$;


REVOKE ALL ON FUNCTION arcade_private.quizoria_endless_credit(uuid) FROM PUBLIC,anon,authenticated;

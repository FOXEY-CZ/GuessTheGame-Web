-- Quizoria 1.5: count Music rewards in all previously deployed Quizoria reward caps.
-- Only function logic changes; no saves, receipt entries, or balances are modified.
CREATE OR REPLACE FUNCTION arcade_private.quizoria_meme_credit(
  p_run_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_meme_runs%rowtype;
        previous arcade_private.quizoria_meme_rewards%rowtype;
        w public.arcade_wallets%rowtype;m arcade_private.quiz_reward_modes%rowtype;
        v_xp integer:=0;v_crowns integer:=0;v_shards integer:=0;
        reason text:='below_threshold';v_hour int;v_day int;v_meme int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO r FROM arcade_private.quizoria_meme_runs
    WHERE run_id=p_run_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND OR r.finished IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'run_not_finished';END IF;
  SELECT * INTO previous FROM arcade_private.quizoria_meme_rewards WHERE run_id=p_run_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'xp',previous.xp,'crowns',previous.crowns,
      'shards',previous.shards,'reason',previous.reason);
  END IF;
  -- The same wallet lock used by original verified game payouts.
  INSERT INTO public.arcade_wallets(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
  SELECT * INTO w FROM public.arcade_wallets WHERE user_id=uid FOR UPDATE;
  SELECT * INTO m FROM arcade_private.quiz_reward_modes WHERE user_id=uid FOR UPDATE;
  IF r.correct>=1 THEN
    v_xp:=LEAST(30,GREATEST(3,r.score/4));
    IF r.correct>=8 THEN v_crowns:=1;END IF;
    IF r.mode='daily' AND r.correct=jsonb_array_length(r.questions) THEN v_shards:=1;END IF;
  END IF;
  IF v_xp=0 THEN reason:='below_threshold';
  ELSIF NOT EXISTS(
      SELECT 1 FROM arcade_private.quiz_payout_release_gate
      WHERE gate_name='verified_rewards' AND enabled
    ) OR m.user_id IS NULL OR m.enabled IS DISTINCT FROM TRUE
    OR NOT EXISTS(
      SELECT 1 FROM arcade_private.quiz_reward_activation_audit a
      WHERE a.user_id=uid AND a.activated_at=m.activated_at
    ) THEN reason:='not_activated';
  ELSE
    SELECT count(*) INTO v_meme FROM arcade_private.quizoria_meme_rewards
      WHERE user_id=uid AND xp>0
      AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date;
    SELECT (
      (SELECT count(*) FROM arcade_private.quizoria_meme_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
      +(SELECT count(*) FROM arcade_private.quizoria_movie_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
      +(SELECT count(*) FROM arcade_private.quizoria_million_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
      +(SELECT count(*) FROM arcade_private.quizoria_music_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
      +(SELECT count(*) FROM arcade_private.quiz_reward_receipts
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
    ) INTO v_hour;
    SELECT (
      (SELECT count(*) FROM arcade_private.quizoria_meme_rewards
       WHERE user_id=uid AND xp>0
       AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      +(SELECT count(*) FROM arcade_private.quizoria_movie_rewards
       WHERE user_id=uid AND xp>0
       AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      +(SELECT count(*) FROM arcade_private.quizoria_million_rewards
       WHERE user_id=uid AND xp>0
       AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      +(SELECT count(*) FROM arcade_private.quizoria_music_rewards
       WHERE user_id=uid AND xp>0 AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      +(SELECT count(*) FROM arcade_private.quiz_reward_receipts
       WHERE user_id=uid AND xp>0
       AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
    ) INTO v_day;
    IF v_meme>=3 OR v_hour>=3 OR v_day>=8 THEN reason:='daily_limit';
    ELSIF r.mode='daily' AND EXISTS(
      SELECT 1 FROM arcade_private.quizoria_meme_rewards cr
      JOIN arcade_private.quizoria_meme_runs old ON old.run_id=cr.run_id
      WHERE cr.user_id=uid AND cr.xp>0 AND old.mode='daily'
      AND (old.started_at AT TIME ZONE 'UTC')::date=
          (r.started_at AT TIME ZONE 'UTC')::date
    ) THEN reason:='duplicate_daily';
    ELSIF w.crowns+v_crowns>1000000000 OR w.shards+v_shards>1000000000
      THEN reason:='wallet_limit';
    ELSE reason:='credited';
    END IF;
  END IF;
  IF reason<>'credited' THEN v_xp:=0;v_crowns:=0;v_shards:=0;END IF;
  INSERT INTO arcade_private.quizoria_meme_rewards(
    run_id,user_id,xp,crowns,shards,reason
  ) VALUES(p_run_id,uid,v_xp,v_crowns,v_shards,reason);
  IF reason='credited' THEN
    INSERT INTO public.arcade_profiles(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
    UPDATE public.arcade_profiles
      SET arcade_xp=arcade_xp+v_xp,updated_at=now()
      WHERE user_id=uid;
    UPDATE public.arcade_wallets
      SET crowns=crowns+v_crowns,shards=shards+v_shards,updated_at=now()
      WHERE user_id=uid;
    UPDATE arcade_private.quiz_reward_modes
      SET verified_xp=verified_xp+v_xp,updated_at=now()
      WHERE user_id=uid;
    INSERT INTO public.arcade_wallet_events(
      operation_id,user_id,kind,details
    ) VALUES(p_run_id,uid,'game_earnings',
      jsonb_build_object('source','quizoria-memes-v1','run_id',p_run_id,
        'xp',v_xp,'crowns',v_crowns,'shards',v_shards)
    );
  END IF;
  RETURN jsonb_build_object('xp',v_xp,'crowns',v_crowns,
    'shards',v_shards,'reason',reason);
END
$$;
REVOKE ALL ON FUNCTION arcade_private.quizoria_meme_credit(uuid)
  FROM PUBLIC,anon,authenticated;



CREATE OR REPLACE FUNCTION arcade_private.quizoria_million_credit(
  p_run_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  r arcade_private.quizoria_million_runs%rowtype;
  rec arcade_private.quizoria_million_rewards%rowtype;
  uid uuid:=auth.uid();
  v_xp integer:=0;v_crowns integer:=0;v_shards integer:=0;
  v_our_day integer;v_hour integer;v_day integer;
  reason text:='not_eligible';
BEGIN
  IF uid IS NULL OR p_run_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO r FROM arcade_private.quizoria_million_runs
    WHERE run_id=p_run_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND OR r.status NOT IN ('won','lost','cashed')
  THEN RAISE EXCEPTION 'invalid_settlement';END IF;
  SELECT * INTO rec FROM arcade_private.quizoria_million_rewards WHERE run_id=p_run_id;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'xp',rec.xp,'crowns',rec.crowns,'shards',rec.shards,'reason',rec.reason);
  END IF;
  -- Serialize this player's Million Challenge settlements.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,20261109));
  IF r.payout>=1000000 THEN v_xp:=48;v_crowns:=2;v_shards:=1;
  ELSIF r.payout>=32000 THEN v_xp:=25;v_crowns:=1;
  ELSIF r.payout>=1000 THEN v_xp:=10;v_crowns:=0;
  END IF;
  IF v_xp=0 THEN reason:='below_checkpoint';
  ELSIF NOT EXISTS(
    SELECT 1 FROM arcade_private.quiz_payout_release_gate
      WHERE gate_name='verified_rewards' AND enabled
  ) OR NOT EXISTS(
    SELECT 1 FROM arcade_private.quiz_reward_modes
      WHERE user_id=uid AND enabled
        AND EXISTS(
          SELECT 1 FROM arcade_private.quiz_reward_activation_audit audit
          WHERE audit.user_id=uid
          AND audit.activated_at=arcade_private.quiz_reward_modes.activated_at
        )
  ) THEN
    reason:='not_activated';
  ELSE
    SELECT count(*) INTO v_our_day FROM arcade_private.quizoria_million_rewards
    WHERE user_id=uid AND xp>0 AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date;
    SELECT
      (SELECT count(*) FROM arcade_private.quizoria_million_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')+
      (SELECT count(*) FROM arcade_private.quizoria_meme_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')+
      (SELECT count(*) FROM arcade_private.quizoria_movie_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')+
      (SELECT count(*) FROM arcade_private.quizoria_music_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')+
      (SELECT count(*) FROM arcade_private.quiz_reward_receipts
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
    INTO v_hour;
    SELECT
      (SELECT count(*) FROM arcade_private.quizoria_million_rewards
       WHERE user_id=uid AND xp>0 AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)+
      (SELECT count(*) FROM arcade_private.quizoria_meme_rewards
       WHERE user_id=uid AND xp>0 AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)+
      (SELECT count(*) FROM arcade_private.quizoria_movie_rewards
       WHERE user_id=uid AND xp>0 AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)+
      (SELECT count(*) FROM arcade_private.quizoria_music_rewards
       WHERE user_id=uid AND xp>0 AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)+
      (SELECT count(*) FROM arcade_private.quiz_reward_receipts
       WHERE user_id=uid AND xp>0 AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
    INTO v_day;
    IF v_our_day>=2 OR v_hour>=3 OR v_day>=8 THEN
      reason:='daily_limit';v_xp:=0;v_crowns:=0;v_shards:=0;
    ELSE reason:='credited';
    END IF;
  END IF;
  -- Same hard wallet ceiling as the existing verified quiz payout system.
  IF reason='credited' AND EXISTS(
    SELECT 1 FROM public.arcade_wallets w
    WHERE w.user_id=uid AND
      (w.crowns+v_crowns>1000000000 OR w.shards+v_shards>1000000000)
  ) THEN reason:='wallet_limit';END IF;
  IF reason<>'credited' THEN
    v_xp:=0;v_crowns:=0;v_shards:=0;
  END IF;
  INSERT INTO arcade_private.quizoria_million_rewards(
    run_id,user_id,xp,crowns,shards,reason
  ) VALUES(p_run_id,uid,v_xp,v_crowns,v_shards,reason)
  ON CONFLICT(run_id) DO NOTHING;
  IF reason='credited' THEN
    INSERT INTO public.arcade_profiles(user_id) VALUES(uid)
      ON CONFLICT(user_id) DO NOTHING;
    INSERT INTO public.arcade_wallets(user_id) VALUES(uid)
      ON CONFLICT(user_id) DO NOTHING;
    UPDATE public.arcade_profiles
      SET arcade_xp=arcade_xp+v_xp,updated_at=now()
      WHERE user_id=uid;
    UPDATE public.arcade_wallets
      SET crowns=crowns+v_crowns,shards=shards+v_shards,updated_at=now()
      WHERE user_id=uid;
    -- Maintain the same global XP ledger expected by verified reward RPCs.
    UPDATE arcade_private.quiz_reward_modes
      SET verified_xp=verified_xp+v_xp,updated_at=now()
      WHERE user_id=uid;
    INSERT INTO public.arcade_wallet_events(
      operation_id,user_id,kind,details
    ) VALUES(
      p_run_id,uid,'game_earnings',
      pg_catalog.jsonb_build_object(
        'source','quizoria-million-v1','run_id',p_run_id,
        'xp',v_xp,'crowns',v_crowns,'shards',v_shards
      )
    ) ON CONFLICT(operation_id) DO NOTHING;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'xp',v_xp,'crowns',v_crowns,'shards',v_shards,'reason',reason
  );
END;
$$;
REVOKE ALL ON FUNCTION arcade_private.quizoria_million_credit(uuid)
  FROM PUBLIC,anon,authenticated;


CREATE OR REPLACE FUNCTION arcade_private.quizoria_movie_credit(
  p_run_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_movie_runs%rowtype;
        previous arcade_private.quizoria_movie_rewards%rowtype;
        w public.arcade_wallets%rowtype;m arcade_private.quiz_reward_modes%rowtype;
        v_xp integer:=0;v_crowns integer:=0;v_shards integer:=0;
        reason text:='below_threshold';v_hour int;v_day int;v_movie int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO r FROM arcade_private.quizoria_movie_runs
    WHERE run_id=p_run_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND OR r.finished IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'run_not_finished';END IF;
  SELECT * INTO previous FROM arcade_private.quizoria_movie_rewards WHERE run_id=p_run_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'xp',previous.xp,'crowns',previous.crowns,
      'shards',previous.shards,'reason',previous.reason);
  END IF;
  -- The same wallet lock used by original verified game payouts.
  INSERT INTO public.arcade_wallets(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
  SELECT * INTO w FROM public.arcade_wallets WHERE user_id=uid FOR UPDATE;
  SELECT * INTO m FROM arcade_private.quiz_reward_modes WHERE user_id=uid FOR UPDATE;
  IF r.correct>=1 THEN
    v_xp:=LEAST(30,GREATEST(3,r.score/4));
    IF r.correct>=8 THEN v_crowns:=1;END IF;
    IF r.mode='daily' AND r.correct=jsonb_array_length(r.questions) THEN v_shards:=1;END IF;
  END IF;
  IF v_xp=0 THEN reason:='below_threshold';
  ELSIF NOT EXISTS(
      SELECT 1 FROM arcade_private.quiz_payout_release_gate
      WHERE gate_name='verified_rewards' AND enabled
    ) OR m.user_id IS NULL OR m.enabled IS DISTINCT FROM TRUE
    OR NOT EXISTS(
      SELECT 1 FROM arcade_private.quiz_reward_activation_audit a
      WHERE a.user_id=uid AND a.activated_at=m.activated_at
    ) THEN reason:='not_activated';
  ELSE
    SELECT count(*) INTO v_movie FROM arcade_private.quizoria_movie_rewards
      WHERE user_id=uid AND xp>0
      AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date;
    SELECT (
      (SELECT count(*) FROM arcade_private.quizoria_movie_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
      +(SELECT count(*) FROM arcade_private.quizoria_meme_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
      +(SELECT count(*) FROM arcade_private.quizoria_million_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
      +(SELECT count(*) FROM arcade_private.quizoria_music_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
      +(SELECT count(*) FROM arcade_private.quiz_reward_receipts
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
    ) INTO v_hour;
    SELECT (
      (SELECT count(*) FROM arcade_private.quizoria_movie_rewards
       WHERE user_id=uid AND xp>0
       AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      +(SELECT count(*) FROM arcade_private.quizoria_meme_rewards
       WHERE user_id=uid AND xp>0
       AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      +(SELECT count(*) FROM arcade_private.quizoria_million_rewards
       WHERE user_id=uid AND xp>0
       AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      +(SELECT count(*) FROM arcade_private.quizoria_music_rewards
       WHERE user_id=uid AND xp>0 AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      +(SELECT count(*) FROM arcade_private.quiz_reward_receipts
       WHERE user_id=uid AND xp>0
       AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
    ) INTO v_day;
    IF v_movie>=3 OR v_hour>=3 OR v_day>=8 THEN reason:='daily_limit';
    ELSIF r.mode='daily' AND EXISTS(
      SELECT 1 FROM arcade_private.quizoria_movie_rewards cr
      JOIN arcade_private.quizoria_movie_runs old ON old.run_id=cr.run_id
      WHERE cr.user_id=uid AND cr.xp>0 AND old.mode='daily'
      AND (old.started_at AT TIME ZONE 'UTC')::date=
          (r.started_at AT TIME ZONE 'UTC')::date
    ) THEN reason:='duplicate_daily';
    ELSIF w.crowns+v_crowns>1000000000 OR w.shards+v_shards>1000000000
      THEN reason:='wallet_limit';
    ELSE reason:='credited';
    END IF;
  END IF;
  IF reason<>'credited' THEN v_xp:=0;v_crowns:=0;v_shards:=0;END IF;
  INSERT INTO arcade_private.quizoria_movie_rewards(
    run_id,user_id,xp,crowns,shards,reason
  ) VALUES(p_run_id,uid,v_xp,v_crowns,v_shards,reason);
  IF reason='credited' THEN
    INSERT INTO public.arcade_profiles(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
    UPDATE public.arcade_profiles
      SET arcade_xp=arcade_xp+v_xp,updated_at=now()
      WHERE user_id=uid;
    UPDATE public.arcade_wallets
      SET crowns=crowns+v_crowns,shards=shards+v_shards,updated_at=now()
      WHERE user_id=uid;
    UPDATE arcade_private.quiz_reward_modes
      SET verified_xp=verified_xp+v_xp,updated_at=now()
      WHERE user_id=uid;
    INSERT INTO public.arcade_wallet_events(
      operation_id,user_id,kind,details
    ) VALUES(p_run_id,uid,'game_earnings',
      jsonb_build_object('source','quizoria-movies-v1','run_id',p_run_id,
        'xp',v_xp,'crowns',v_crowns,'shards',v_shards)
    );
  END IF;
  RETURN jsonb_build_object('xp',v_xp,'crowns',v_crowns,
    'shards',v_shards,'reason',reason);
END
$$;
REVOKE ALL ON FUNCTION arcade_private.quizoria_movie_credit(uuid)
  FROM PUBLIC,anon,authenticated;


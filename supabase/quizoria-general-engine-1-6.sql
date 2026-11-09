-- Quizoria 1.5 Music: isolated questions/runs/results/duels. All answers server-only.
-- Baseline is the verified movie RPC engine; only the new music tables/functions are created.
-- Quizoria 1.4: independently stored film/series text+emoji trivia.
-- Based on tested server-authoritative quiz engine; no third-party posters or stills.

CREATE TABLE IF NOT EXISTS arcade_private.quizoria_general_questions(
  id text PRIMARY KEY,
  topic_key text NOT NULL,
  media_type text NOT NULL CHECK(media_type IN ('geography','history','science','technology')),
  difficulty text NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
  prompt_cs text NOT NULL,
  prompt_en text NOT NULL,
  options jsonb NOT NULL CHECK(jsonb_typeof(options)='array' AND jsonb_array_length(options)=4),
  answer_index integer NOT NULL CHECK(answer_index BETWEEN 0 AND 3),
  visual text NOT NULL,
  source_url text NOT NULL,
  author text NOT NULL,
  license text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(topic_key,difficulty)
);
ALTER TABLE arcade_private.quizoria_general_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_general_questions FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS arcade_private.quizoria_general_runs(
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  mode text NOT NULL CHECK(mode IN ('classic','easy','medium','hard','geography','history','science','technology','daily','friend')),
  questions jsonb NOT NULL,
  next_index integer NOT NULL DEFAULT 0 CHECK(next_index BETWEEN 0 AND 10),
  score integer NOT NULL DEFAULT 0 CHECK(score BETWEEN 0 AND 100),
  correct integer NOT NULL DEFAULT 0 CHECK(correct BETWEEN 0 AND 10),
  finished boolean NOT NULL DEFAULT false,
  challenge_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT(now()+interval '7 days'),
  finished_at timestamptz,
  UNIQUE(user_id,operation_id)
);
ALTER TABLE arcade_private.quizoria_general_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_general_runs FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS quizoria_general_runs_user_started
  ON arcade_private.quizoria_general_runs(user_id,started_at DESC);

CREATE TABLE IF NOT EXISTS arcade_private.quizoria_general_events(
  event_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES arcade_private.quizoria_general_runs(run_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  index_at_answer integer NOT NULL,
  choice integer NOT NULL,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE arcade_private.quizoria_general_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_general_events FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS arcade_private.quizoria_general_rewards(
  run_id uuid PRIMARY KEY REFERENCES arcade_private.quizoria_general_runs(run_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  xp integer NOT NULL DEFAULT 0,
  crowns integer NOT NULL DEFAULT 0,
  shards integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE arcade_private.quizoria_general_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_general_rewards FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS quizoria_general_rewards_recent
  ON arcade_private.quizoria_general_rewards(user_id,created_at DESC)
  WHERE xp>0;

CREATE TABLE IF NOT EXISTS arcade_private.quizoria_general_challenges(
  challenge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_run_id uuid REFERENCES arcade_private.quizoria_general_runs(run_id),
  challenger_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  challenger_run_id uuid REFERENCES arcade_private.quizoria_general_runs(run_id),
  operation_id uuid NOT NULL,
  questions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT(now()+interval '7 days'),
  UNIQUE(creator_id,operation_id)
);
ALTER TABLE arcade_private.quizoria_general_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_general_challenges FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS quizoria_general_challenges_creator
  ON arcade_private.quizoria_general_challenges(creator_id,created_at DESC);
CREATE INDEX IF NOT EXISTS quizoria_general_challenges_joiner
  ON arcade_private.quizoria_general_challenges(challenger_id,created_at DESC);

CREATE OR REPLACE FUNCTION arcade_private.quizoria_general_pick(
  p_mode text,p_seed text
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$
  WITH topic_list AS (
    SELECT DISTINCT topic_key,media_type
    FROM arcade_private.quizoria_general_questions
  ), seeded AS (
    SELECT topic_key,media_type,
      row_number() OVER(PARTITION BY media_type
        ORDER BY md5(p_seed||':subject:'||topic_key)) AS group_pos
    FROM topic_list
  ), allocated AS (
    SELECT topic_key,media_type
    FROM seeded
    WHERE CASE
      WHEN p_mode IN ('geography','history','science','technology')
        THEN media_type=p_mode AND group_pos<=10
      WHEN p_mode='daily' THEN group_pos<=
        CASE media_type WHEN 'geography' THEN 2 ELSE 1 END
      ELSE group_pos <=
        CASE media_type WHEN 'geography' THEN 3 WHEN 'history' THEN 3 ELSE 2 END
      END
  ), randomized AS (
    SELECT topic_key,media_type,
      row_number() OVER(ORDER BY md5(p_seed||':round:'||topic_key)) AS position
    FROM allocated
  ), selected AS (
    SELECT p.position,q.*
    FROM randomized p
    JOIN arcade_private.quizoria_general_questions q
      ON q.topic_key=p.topic_key
    WHERE q.difficulty=CASE
      WHEN p_mode IN ('easy','medium','hard') THEN p_mode
      WHEN p.position<=CASE WHEN p_mode='daily' THEN 2 ELSE 4 END THEN 'easy'
      WHEN p.position<=CASE WHEN p_mode='daily' THEN 4 ELSE 8 END THEN 'medium'
      ELSE 'hard' END
  )
  SELECT jsonb_agg(jsonb_build_object(
    'id',id,'topic_key',topic_key,'media_type',media_type,
    'difficulty',difficulty,'prompt_cs',prompt_cs,'prompt_en',prompt_en,
    'clue_cs',clue_cs,'clue_en',clue_en,
    'options',options,'answer_index',answer_index,
    'visual',visual,'source_url',source_url,
    'author',author,'license',license
  ) ORDER BY position)
  FROM selected
$$;
REVOKE ALL ON FUNCTION arcade_private.quizoria_general_pick(text,text)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION arcade_private.quizoria_general_view(
  p_run arcade_private.quizoria_general_runs
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE q jsonb; reward jsonb; expired boolean;
BEGIN
  expired:=p_run.expires_at<=now() AND p_run.finished IS DISTINCT FROM true;
  IF p_run.finished IS DISTINCT FROM true AND NOT expired
    AND p_run.next_index<jsonb_array_length(p_run.questions)
  THEN q:=p_run.questions->p_run.next_index;
  END IF;
  SELECT jsonb_build_object(
    'xp',xp,'crowns',crowns,'shards',shards,'reason',reason
  ) INTO reward FROM arcade_private.quizoria_general_rewards WHERE run_id=p_run.run_id;
  RETURN jsonb_build_object(
    'ok',true,'has_run',true,'run_id',p_run.run_id,
    'mode',p_run.mode,'stage',p_run.next_index,'total',jsonb_array_length(p_run.questions),
    'score',p_run.score,'correct',p_run.correct,
    'finished',p_run.finished,'expired',expired,
    'challenge_id',p_run.challenge_id,'expires_at',p_run.expires_at,
    'question',CASE WHEN q IS NULL THEN NULL ELSE jsonb_build_object(
      'prompt_cs',q->>'prompt_cs','prompt_en',q->>'prompt_en',
      'visual',q->>'visual','source_url',q->>'source_url',
      'author',q->>'author','license',q->>'license',
      'difficulty',q->>'difficulty','media_type',q->>'media_type',
      'options',q->'options'
    ) END,
    'reward',reward
  );
END
$$;
REVOKE ALL ON FUNCTION arcade_private.quizoria_general_view(arcade_private.quizoria_general_runs)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION arcade_private.quizoria_general_credit(
  p_run_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_general_runs%rowtype;
        previous arcade_private.quizoria_general_rewards%rowtype;
        w public.arcade_wallets%rowtype;m arcade_private.quiz_reward_modes%rowtype;
        v_xp integer:=0;v_crowns integer:=0;v_shards integer:=0;
        reason text:='below_threshold';v_hour int;v_day int;v_movie int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO r FROM arcade_private.quizoria_general_runs
    WHERE run_id=p_run_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND OR r.finished IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'run_not_finished';END IF;
  SELECT * INTO previous FROM arcade_private.quizoria_general_rewards WHERE run_id=p_run_id;
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
    SELECT count(*) INTO v_movie FROM arcade_private.quizoria_general_rewards
      WHERE user_id=uid AND xp>0
      AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date;
    SELECT (
      (SELECT count(*) FROM arcade_private.quizoria_general_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
      +(SELECT count(*) FROM arcade_private.quizoria_meme_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
      +(SELECT count(*) FROM arcade_private.quizoria_movie_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
      +(SELECT count(*) FROM arcade_private.quizoria_music_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
      +(SELECT count(*) FROM arcade_private.quizoria_million_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
      +(SELECT count(*) FROM arcade_private.quiz_reward_receipts
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
    ) INTO v_hour;
    SELECT (
      (SELECT count(*) FROM arcade_private.quizoria_general_rewards
       WHERE user_id=uid AND xp>0
       AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      +(SELECT count(*) FROM arcade_private.quizoria_meme_rewards
       WHERE user_id=uid AND xp>0
       AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      +(SELECT count(*) FROM arcade_private.quizoria_movie_rewards
       WHERE user_id=uid AND xp>0
       AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      +(SELECT count(*) FROM arcade_private.quizoria_music_rewards
       WHERE user_id=uid AND xp>0
       AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      +(SELECT count(*) FROM arcade_private.quizoria_million_rewards
       WHERE user_id=uid AND xp>0
       AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      +(SELECT count(*) FROM arcade_private.quiz_reward_receipts
       WHERE user_id=uid AND xp>0
       AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
    ) INTO v_day;
    IF v_movie>=3 OR v_hour>=3 OR v_day>=8 THEN reason:='daily_limit';
    ELSIF r.mode='daily' AND EXISTS(
      SELECT 1 FROM arcade_private.quizoria_general_rewards cr
      JOIN arcade_private.quizoria_general_runs old ON old.run_id=cr.run_id
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
  INSERT INTO arcade_private.quizoria_general_rewards(
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
      jsonb_build_object('source','quizoria-general-v1','run_id',p_run_id,
        'xp',v_xp,'crowns',v_crowns,'shards',v_shards)
    );
  END IF;
  RETURN jsonb_build_object('xp',v_xp,'crowns',v_crowns,
    'shards',v_shards,'reason',reason);
END
$$;
REVOKE ALL ON FUNCTION arcade_private.quizoria_general_credit(uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.quizoria_general_begin(
  p_mode text,p_operation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_general_runs%rowtype;
  qs jsonb;seed text;v_count int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
  IF p_operation IS NULL OR p_mode NOT IN ('classic','easy','medium','hard','geography','history','science','technology','daily')
    OR p_mode IS NULL THEN RAISE EXCEPTION 'invalid_mode';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended(uid::text,20261206));
  SELECT * INTO r FROM arcade_private.quizoria_general_runs
    WHERE user_id=uid AND operation_id=p_operation;
  IF FOUND THEN
    IF r.mode<>p_mode THEN RAISE EXCEPTION 'operation_conflict';END IF;
    RETURN arcade_private.quizoria_general_view(r);
  END IF;
  -- Daily quiz is the same question list globally (UTC) and one run per player.
  IF p_mode='daily' THEN
    SELECT * INTO r FROM arcade_private.quizoria_general_runs
      WHERE user_id=uid AND mode='daily'
      AND (started_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
    IF FOUND THEN RETURN arcade_private.quizoria_general_view(r);END IF;
  END IF;
  SELECT * INTO r FROM arcade_private.quizoria_general_runs
    WHERE user_id=uid AND mode=p_mode AND finished=false AND expires_at>now()
      AND (p_mode<>'daily' OR (started_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN arcade_private.quizoria_general_view(r);END IF;
  SELECT count(*) INTO v_count FROM arcade_private.quizoria_general_runs
    WHERE user_id=uid AND started_at>now()-interval '1 hour';
  IF v_count>=16 THEN RAISE EXCEPTION 'rate_limited';END IF;
  seed:=CASE WHEN p_mode='daily' THEN
    'quizoria-general-daily-v1:'||(now() AT TIME ZONE 'UTC')::date::text
    ELSE 'quizoria-general-v1:'||p_operation::text END;
  qs:=arcade_private.quizoria_general_pick(p_mode,seed);
  IF qs IS NULL OR jsonb_array_length(qs)<>(CASE WHEN p_mode='daily' THEN 5 ELSE 10 END)
  THEN RAISE EXCEPTION 'general_question_bank_incomplete';END IF;
  INSERT INTO arcade_private.quizoria_general_runs(
    user_id,operation_id,mode,questions
  ) VALUES(uid,p_operation,p_mode,qs) RETURNING * INTO r;
  RETURN arcade_private.quizoria_general_view(r);
END
$$;
REVOKE ALL ON FUNCTION public.quizoria_general_begin(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_general_begin(text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.quizoria_general_resume(
  p_run_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_general_runs%rowtype;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
  SELECT * INTO r FROM arcade_private.quizoria_general_runs
    WHERE run_id=p_run_id AND user_id=uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_yours';END IF;
  RETURN arcade_private.quizoria_general_view(r);
END
$$;
REVOKE ALL ON FUNCTION public.quizoria_general_resume(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_general_resume(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.quizoria_general_my_runs()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid();runs jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'run_id',run_id,'mode',mode,'score',score,'correct',correct,
      'stage',next_index,'total',jsonb_array_length(questions),
      'finished',finished,'expires_at',expires_at,
      'challenge_id',challenge_id,'started_at',started_at
    ) ORDER BY started_at DESC),'[]'::jsonb)
  INTO runs FROM (
    SELECT * FROM arcade_private.quizoria_general_runs
    WHERE user_id=uid AND started_at>now()-interval '14 days'
    ORDER BY started_at DESC LIMIT 25
  ) latest;
  RETURN jsonb_build_object('ok',true,'runs',runs);
END
$$;
REVOKE ALL ON FUNCTION public.quizoria_general_my_runs() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_general_my_runs() TO authenticated;

CREATE OR REPLACE FUNCTION public.quizoria_general_answer(
  p_run_id uuid,p_event_id uuid,p_choice integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_general_runs%rowtype;
  evt arcade_private.quizoria_general_events%rowtype;
  q jsonb;correct boolean;reward jsonb;answer_index int;receipt jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
  IF p_run_id IS NULL OR p_event_id IS NULL OR p_choice NOT BETWEEN 0 AND 3 OR p_choice IS NULL
  THEN RAISE EXCEPTION 'invalid_answer';END IF;
  SELECT * INTO r FROM arcade_private.quizoria_general_runs
    WHERE run_id=p_run_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_yours';END IF;
  SELECT * INTO evt FROM arcade_private.quizoria_general_events WHERE event_id=p_event_id;
  IF FOUND THEN
    IF evt.run_id<>p_run_id OR evt.user_id<>uid OR evt.choice<>p_choice
    THEN RAISE EXCEPTION 'event_id_conflict';END IF;
    RETURN evt.receipt;
  END IF;
  IF r.finished OR r.expires_at<=now() OR
    r.next_index>=jsonb_array_length(r.questions)
  THEN RAISE EXCEPTION 'run_finished_or_expired';END IF;
  q:=r.questions->r.next_index;
  answer_index:=(q->>'answer_index')::integer;
  IF answer_index NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'invalid_question';END IF;
  correct:=p_choice=answer_index;
  r.next_index:=r.next_index+1;
  IF correct THEN r.correct:=r.correct+1;r.score:=r.score+10;END IF;
  r.finished:=r.next_index=jsonb_array_length(r.questions);
  UPDATE arcade_private.quizoria_general_runs SET
    next_index=r.next_index,score=r.score,correct=r.correct,
    finished=r.finished,
    finished_at=CASE WHEN r.finished THEN now() ELSE NULL END
  WHERE run_id=r.run_id;
  IF r.finished THEN reward:=arcade_private.quizoria_general_credit(r.run_id);END IF;
  receipt:=arcade_private.quizoria_general_view(r) ||
    jsonb_build_object('answered',true,'was_correct',correct,
      'correct_option',answer_index);
  INSERT INTO arcade_private.quizoria_general_events(
    event_id,run_id,user_id,index_at_answer,choice,receipt
  ) VALUES(p_event_id,p_run_id,uid,r.next_index-1,p_choice,receipt);
  RETURN receipt;
END
$$;
REVOKE ALL ON FUNCTION public.quizoria_general_answer(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_general_answer(uuid,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.quizoria_general_challenge_create(
  p_operation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid();c arcade_private.quizoria_general_challenges%rowtype;
  r arcade_private.quizoria_general_runs%rowtype;qs jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
  IF p_operation IS NULL THEN RAISE EXCEPTION 'invalid_operation';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended(uid::text,20261207));
  SELECT * INTO c FROM arcade_private.quizoria_general_challenges
    WHERE creator_id=uid AND operation_id=p_operation;
  IF FOUND THEN
    SELECT * INTO r FROM arcade_private.quizoria_general_runs
      WHERE run_id=c.creator_run_id AND user_id=uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'challenge_inconsistent';END IF;
    RETURN arcade_private.quizoria_general_view(r) ||
      jsonb_build_object('challenge_id',c.challenge_id,'creator',true);
  END IF;
  IF (SELECT count(*) FROM arcade_private.quizoria_general_challenges
      WHERE creator_id=uid AND created_at>now()-interval '1 hour')>=5
  THEN RAISE EXCEPTION 'challenge_rate_limited';END IF;
  qs:=arcade_private.quizoria_general_pick('friend','quizoria-general-friend-v1:'||p_operation::text);
  IF qs IS NULL OR jsonb_array_length(qs)<>10
  THEN RAISE EXCEPTION 'general_question_bank_incomplete';END IF;
  INSERT INTO arcade_private.quizoria_general_challenges(
    creator_id,operation_id,questions
  ) VALUES(uid,p_operation,qs) RETURNING * INTO c;
  INSERT INTO arcade_private.quizoria_general_runs(
    user_id,operation_id,mode,questions,challenge_id
  ) VALUES(uid,p_operation,'friend',qs,c.challenge_id)
  RETURNING * INTO r;
  UPDATE arcade_private.quizoria_general_challenges
    SET creator_run_id=r.run_id WHERE challenge_id=c.challenge_id;
  RETURN arcade_private.quizoria_general_view(r) ||
    jsonb_build_object('challenge_id',c.challenge_id,'creator',true);
END
$$;
REVOKE ALL ON FUNCTION public.quizoria_general_challenge_create(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_general_challenge_create(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.quizoria_general_challenge_join(
  p_challenge_id uuid,p_operation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid();c arcade_private.quizoria_general_challenges%rowtype;
  r arcade_private.quizoria_general_runs%rowtype;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
  IF p_challenge_id IS NULL OR p_operation IS NULL
    THEN RAISE EXCEPTION 'invalid_challenge';END IF;
  SELECT * INTO c FROM arcade_private.quizoria_general_challenges
    WHERE challenge_id=p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found';END IF;
  IF c.creator_id=uid THEN
    SELECT * INTO r FROM arcade_private.quizoria_general_runs WHERE run_id=c.creator_run_id;
    RETURN arcade_private.quizoria_general_view(r) ||
      jsonb_build_object('challenge_id',c.challenge_id,'creator',true);
  END IF;
  IF c.expires_at<=now() OR (c.challenger_id IS NOT NULL AND c.challenger_id<>uid)
    THEN RAISE EXCEPTION 'challenge_unavailable';END IF;
  IF c.challenger_id=uid THEN
    SELECT * INTO r FROM arcade_private.quizoria_general_runs WHERE run_id=c.challenger_run_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'challenge_inconsistent';END IF;
    RETURN arcade_private.quizoria_general_view(r) ||
      jsonb_build_object('challenge_id',c.challenge_id,'creator',false);
  END IF;
  INSERT INTO arcade_private.quizoria_general_runs(
    user_id,operation_id,mode,questions,challenge_id
  ) VALUES(uid,p_operation,'friend',c.questions,c.challenge_id)
  RETURNING * INTO r;
  UPDATE arcade_private.quizoria_general_challenges
    SET challenger_id=uid,challenger_run_id=r.run_id
    WHERE challenge_id=c.challenge_id;
  RETURN arcade_private.quizoria_general_view(r) ||
    jsonb_build_object('challenge_id',c.challenge_id,'creator',false);
END
$$;
REVOKE ALL ON FUNCTION public.quizoria_general_challenge_join(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_general_challenge_join(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.quizoria_general_challenge_status(
  p_challenge_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid();c arcade_private.quizoria_general_challenges%rowtype;
  cr arcade_private.quizoria_general_runs%rowtype;
  rr arcade_private.quizoria_general_runs%rowtype;both_done boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
  SELECT * INTO c FROM arcade_private.quizoria_general_challenges
    WHERE challenge_id=p_challenge_id;
  IF NOT FOUND OR (uid<>c.creator_id AND (c.challenger_id IS NULL OR uid<>c.challenger_id)) THEN
    RAISE EXCEPTION 'challenge_not_yours';END IF;
  SELECT * INTO cr FROM arcade_private.quizoria_general_runs WHERE run_id=c.creator_run_id;
  IF c.challenger_run_id IS NOT NULL THEN
    SELECT * INTO rr FROM arcade_private.quizoria_general_runs WHERE run_id=c.challenger_run_id;
  END IF;
  both_done:=coalesce(cr.finished,false) AND coalesce(rr.finished,false);
  RETURN jsonb_build_object(
    'ok',true,'challenge_id',c.challenge_id,'joined',c.challenger_id IS NOT NULL,
    'both_done',both_done,'creator_done',coalesce(cr.finished,false),
    'challenger_done',coalesce(rr.finished,false),
    'your_role',CASE WHEN uid=c.creator_id THEN 'creator' ELSE 'challenger' END,
    'your_score',CASE WHEN uid=c.creator_id THEN cr.score ELSE rr.score END,
    'creator_score',CASE WHEN both_done THEN cr.score ELSE NULL END,
    'challenger_score',CASE WHEN both_done THEN rr.score ELSE NULL END,
    'winner',CASE WHEN NOT both_done THEN NULL
      WHEN cr.score>rr.score THEN 'creator'
      WHEN cr.score<rr.score THEN 'challenger'
      ELSE 'tie' END
  );
END
$$;
REVOKE ALL ON FUNCTION public.quizoria_general_challenge_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_general_challenge_status(uuid) TO authenticated;

-- Quizoria 1.4: add original textual hints and balance cinema/TV selection.
-- Does not modify saved runs, wallets, profiles or previous quiz functions.
ALTER TABLE arcade_private.quizoria_general_questions
  ADD COLUMN IF NOT EXISTS clue_cs text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS clue_en text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION arcade_private.quizoria_general_pick(
  p_mode text,p_seed text
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$
  WITH topic_list AS (
    SELECT DISTINCT topic_key,media_type
    FROM arcade_private.quizoria_general_questions
  ), seeded AS (
    SELECT topic_key,media_type,
      row_number() OVER(PARTITION BY media_type
        ORDER BY md5(p_seed||':subject:'||topic_key)) AS group_pos
    FROM topic_list
  ), allocated AS (
    SELECT topic_key,media_type
    FROM seeded
    WHERE CASE
      WHEN p_mode IN ('geography','history','science','technology')
        THEN media_type=p_mode AND group_pos<=10
      WHEN p_mode='daily' THEN group_pos<=
        CASE media_type WHEN 'geography' THEN 2 ELSE 1 END
      ELSE group_pos <=
        CASE media_type WHEN 'geography' THEN 3 WHEN 'history' THEN 3 ELSE 2 END
      END
  ), randomized AS (
    SELECT topic_key,media_type,
      row_number() OVER(ORDER BY md5(p_seed||':round:'||topic_key)) AS position
    FROM allocated
  ), selected AS (
    SELECT p.position,q.*
    FROM randomized p
    JOIN arcade_private.quizoria_general_questions q
      ON q.topic_key=p.topic_key
    WHERE q.difficulty=CASE
      WHEN p_mode IN ('easy','medium','hard') THEN p_mode
      WHEN p.position<=CASE WHEN p_mode='daily' THEN 2 ELSE 4 END THEN 'easy'
      WHEN p.position<=CASE WHEN p_mode='daily' THEN 4 ELSE 8 END THEN 'medium'
      ELSE 'hard' END
  )
  SELECT jsonb_agg(jsonb_build_object(
    'id',id,'topic_key',topic_key,'media_type',media_type,
    'difficulty',difficulty,'prompt_cs',prompt_cs,'prompt_en',prompt_en,
    'clue_cs',clue_cs,'clue_en',clue_en,
    'options',options,'answer_index',answer_index,
    'visual',visual,'source_url',source_url,
    'author',author,'license',license
  ) ORDER BY position)
  FROM selected
$$;
REVOKE ALL ON FUNCTION arcade_private.quizoria_general_pick(text,text)
  FROM PUBLIC,anon,authenticated;


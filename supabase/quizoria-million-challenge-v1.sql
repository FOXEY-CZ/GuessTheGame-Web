-- Quizoria Million Challenge 1.0
-- Isolated server-authoritative 15-stage quiz. Original Guess the Game RPCs untouched.
CREATE TABLE IF NOT EXISTS arcade_private.quizoria_million_runs (
  run_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  category_id text NOT NULL DEFAULT 'video-games' CHECK (category_id='video-games'),
  questions jsonb NOT NULL,
  reserves jsonb NOT NULL,
  next_index integer NOT NULL DEFAULT 0 CHECK (next_index BETWEEN 0 AND 15),
  current_hidden jsonb NOT NULL DEFAULT '[]'::jsonb,
  audience jsonb,
  used_fifty boolean NOT NULL DEFAULT false,
  used_audience boolean NOT NULL DEFAULT false,
  used_swap boolean NOT NULL DEFAULT false,
  banked integer NOT NULL DEFAULT 0 CHECK(banked BETWEEN 0 AND 1000000),
  payout integer NOT NULL DEFAULT 0 CHECK(payout BETWEEN 0 AND 1000000),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','won','lost','cashed','expired')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '7 days'),
  completed_at timestamptz,
  UNIQUE(user_id,operation_id)
);
ALTER TABLE arcade_private.quizoria_million_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_million_runs FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS quizoria_million_user_latest
  ON arcade_private.quizoria_million_runs(user_id,started_at DESC);

CREATE TABLE IF NOT EXISTS arcade_private.quizoria_million_actions (
  event_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES arcade_private.quizoria_million_runs(run_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  choice text,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE arcade_private.quizoria_million_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_million_actions FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS arcade_private.quizoria_million_rewards (
  run_id uuid PRIMARY KEY REFERENCES arcade_private.quizoria_million_runs(run_id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  xp integer NOT NULL DEFAULT 0,
  crowns integer NOT NULL DEFAULT 0,
  shards integer NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT 'unavailable',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE arcade_private.quizoria_million_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_million_rewards FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS quizoria_million_paid_recent
  ON arcade_private.quizoria_million_rewards(user_id,created_at DESC)
  WHERE xp>0;

CREATE OR REPLACE FUNCTION arcade_private.quizoria_million_view(
  p_run arcade_private.quizoria_million_runs
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE
  q jsonb; reward jsonb;
BEGIN
  SELECT pg_catalog.jsonb_build_object(
    'xp',xp,'crowns',crowns,'shards',shards,'reason',reason
  ) INTO reward FROM arcade_private.quizoria_million_rewards WHERE run_id=p_run.run_id;
  IF p_run.status='active' AND p_run.next_index<15 AND p_run.expires_at>now() THEN
    q:=p_run.questions->p_run.next_index;
  ELSE
    q:=null;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'has_run',true,'run_id',p_run.run_id,
    'category','video-games','stage',p_run.next_index,
    'status',CASE WHEN p_run.status='active' AND p_run.expires_at<=now()
      THEN 'expired' ELSE p_run.status END,
    'banked',p_run.banked,'payout',p_run.payout,
    'expires_at',p_run.expires_at,
    'used',pg_catalog.jsonb_build_object(
      'fifty',p_run.used_fifty,'audience',p_run.used_audience,
      'swap',p_run.used_swap
    ),
    'question',CASE WHEN q IS NULL THEN NULL ELSE
      pg_catalog.jsonb_build_object(
        'cs',q->>'cs','en',q->>'en','difficulty',q->>'difficulty',
        'options',q->'options',
        'hidden',p_run.current_hidden,'audience',p_run.audience
      ) END,
    'reward',reward
  );
END;
$$;
REVOKE ALL ON FUNCTION arcade_private.quizoria_million_view(arcade_private.quizoria_million_runs)
  FROM PUBLIC,anon,authenticated;

-- Internal payout is deliberately isolated from legacy 10-question reward receipts.
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
  IF r.payout>=1000000 THEN v_xp:=48;v_crowns:=40;v_shards:=1;
  ELSIF r.payout>=32000 THEN v_xp:=25;v_crowns:=20;
  ELSIF r.payout>=1000 THEN v_xp:=10;v_crowns:=8;
  END IF;
  IF v_xp=0 THEN reason:='below_checkpoint';
  ELSIF NOT EXISTS(
    SELECT 1 FROM arcade_private.quiz_payout_release_gate
      WHERE gate_name='verified_rewards' AND enabled
  ) OR NOT EXISTS(
    SELECT 1 FROM arcade_private.quiz_reward_modes
      WHERE user_id=uid AND enabled
  ) THEN
    reason:='not_activated';
  ELSE
    SELECT count(*) INTO v_our_day FROM arcade_private.quizoria_million_rewards
    WHERE user_id=uid AND xp>0 AND created_at::date=(now() AT TIME ZONE 'UTC')::date;
    SELECT
      (SELECT count(*) FROM arcade_private.quizoria_million_rewards
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')+
      (SELECT count(*) FROM arcade_private.quiz_reward_receipts
       WHERE user_id=uid AND xp>0 AND created_at>now()-interval '1 hour')
    INTO v_hour;
    SELECT
      (SELECT count(*) FROM arcade_private.quizoria_million_rewards
       WHERE user_id=uid AND xp>0 AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)+
      (SELECT count(*) FROM arcade_private.quiz_reward_receipts
       WHERE user_id=uid AND xp>0 AND (created_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
    INTO v_day;
    IF v_our_day>=2 OR v_hour>=3 OR v_day>=8 THEN
      reason:='daily_limit';v_xp:=0;v_crowns:=0;v_shards:=0;
    ELSE reason:='credited';
    END IF;
  END IF;
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
    UPDATE public.arcade_profiles SET arcade_xp=arcade_xp+v_xp
      WHERE user_id=uid;
    UPDATE public.arcade_wallets
      SET crowns=crowns+v_crowns,shards=shards+v_shards
      WHERE user_id=uid;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'xp',v_xp,'crowns',v_crowns,'shards',v_shards,'reason',reason
  );
END;
$$;
REVOKE ALL ON FUNCTION arcade_private.quizoria_million_credit(uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.quizoria_million_begin(
  p_operation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  uid uuid:=auth.uid();r arcade_private.quizoria_million_runs%rowtype;
  v_questions jsonb;v_reserves jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
  IF p_operation IS NULL THEN RAISE EXCEPTION 'invalid_operation';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,20261110));
  SELECT * INTO r FROM arcade_private.quizoria_million_runs
    WHERE user_id=uid AND operation_id=p_operation;
  IF FOUND THEN RETURN arcade_private.quizoria_million_view(r);END IF;
  -- Resume an unfinished run rather than silently throwing away saved progress.
  SELECT * INTO r FROM arcade_private.quizoria_million_runs
    WHERE user_id=uid AND status='active' AND expires_at>now()
    ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN arcade_private.quizoria_million_view(r);END IF;
  IF (SELECT count(*) FROM arcade_private.quizoria_million_runs
      WHERE user_id=uid AND started_at>(now()-interval '1 hour'))>=4 OR
     (SELECT count(*) FROM arcade_private.quizoria_million_runs
      WHERE user_id=uid AND (started_at AT TIME ZONE 'UTC')::date=
      (now() AT TIME ZONE 'UTC')::date)>=8
  THEN RAISE EXCEPTION 'quizoria_play_limit';END IF;
  -- No client-supplied question ids or answer keys. Immutable snapshots let
  -- long-running games survive later bank/translation updates.
  WITH bank AS (
    SELECT q.id,q.difficulty,q.answer,
      pg_catalog.coalesce(v4.wrong,v3.wrong,v2.wrong,q.wrong) AS wrong,
      pg_catalog.coalesce(v4.cs,v3.cs,v2.cs,t.cs) AS cs,
      pg_catalog.coalesce(v4.en,v3.en,v2.en,t.en) AS en
    FROM arcade_private.quiz_questions q
    JOIN arcade_private.quiz_question_texts t ON t.id=q.id
    LEFT JOIN arcade_private.quiz_question_options_v2 v2 ON v2.id=q.id
    LEFT JOIN arcade_private.quiz_question_options_v3 v3 ON v3.id=q.id
    LEFT JOIN arcade_private.quiz_question_options_v4 v4 ON v4.id=q.id
    WHERE q.pool='secure' AND q.difficulty IN ('easy','medium','hard')
  ), ranked AS (
    SELECT *,pg_catalog.row_number() OVER(
      PARTITION BY difficulty ORDER BY
      pg_catalog.md5(p_operation::text||':'||id)
    ) AS rn
    FROM bank
    WHERE answer IS NOT NULL AND cs IS NOT NULL AND en IS NOT NULL
      AND cardinality(wrong)>=3
      AND answer<>ALL(wrong) AND
      (SELECT count(DISTINCT x) FROM pg_catalog.unnest(wrong[1:3]) x)=3
  ), chosen AS (
    SELECT b.*,CASE b.difficulty WHEN 'easy' THEN 1
      WHEN 'medium' THEN 2 ELSE 3 END AS tier,
      (SELECT pg_catalog.jsonb_agg(opt ORDER BY
          pg_catalog.md5(p_operation::text||':option:'||b.id||':'||opt))
       FROM pg_catalog.unnest(ARRAY[b.answer,b.wrong[1],b.wrong[2],b.wrong[3]]) opt) AS opts
    FROM ranked b WHERE rn<=6
  ), packed AS (
    SELECT tier,rn,pg_catalog.jsonb_build_object(
      'cs',cs,'en',en,'difficulty',difficulty,
      'answer',answer,'options',opts
    ) AS question FROM chosen
  )
  SELECT pg_catalog.jsonb_agg(question ORDER BY tier,rn) FILTER(WHERE rn<=5),
         pg_catalog.jsonb_agg(question ORDER BY tier,rn) FILTER(WHERE rn=6)
    INTO v_questions,v_reserves FROM packed;
  IF pg_catalog.jsonb_array_length(pg_catalog.coalesce(v_questions,'[]'::jsonb))<>15
    OR pg_catalog.jsonb_array_length(pg_catalog.coalesce(v_reserves,'[]'::jsonb))<>3
  THEN RAISE EXCEPTION 'question_bank_incomplete';END IF;
  INSERT INTO arcade_private.quizoria_million_runs(
    user_id,operation_id,questions,reserves
  ) VALUES(uid,p_operation,v_questions,v_reserves)
  RETURNING * INTO r;
  RETURN arcade_private.quizoria_million_view(r);
END;
$$;
REVOKE ALL ON FUNCTION public.quizoria_million_begin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_million_begin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.quizoria_million_state()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_million_runs%rowtype;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
  SELECT * INTO r FROM arcade_private.quizoria_million_runs
    WHERE user_id=uid ORDER BY
      CASE WHEN status='active' AND expires_at>now() THEN 0 ELSE 1 END,
      started_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('ok',true,'has_run',false);END IF;
  RETURN arcade_private.quizoria_million_view(r);
END;
$$;
REVOKE ALL ON FUNCTION public.quizoria_million_state() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_million_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.quizoria_million_act(
  p_run_id uuid,p_event_id uuid,p_action text,p_choice text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  uid uuid:=auth.uid();r arcade_private.quizoria_million_runs%rowtype;
  old arcade_private.quizoria_million_actions%rowtype;
  q jsonb;v_answer text;v_correct boolean;v_hidden jsonb;
  v_audience jsonb;v_reserve jsonb;v_receipt jsonb;
  v_settle jsonb;v_correct_answer text;
  v_ladder integer[]:=ARRAY[100,200,300,500,1000,2000,4000,8000,16000,
                            32000,64000,125000,250000,500000,1000000];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
  IF p_run_id IS NULL OR p_event_id IS NULL OR
    p_action NOT IN ('answer','fifty','audience','swap','cashout')
  THEN RAISE EXCEPTION 'invalid_action';END IF;
  SELECT * INTO r FROM arcade_private.quizoria_million_runs
    WHERE run_id=p_run_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_run';END IF;
  SELECT * INTO old FROM arcade_private.quizoria_million_actions
    WHERE event_id=p_event_id;
  IF FOUND THEN
    IF old.run_id<>p_run_id OR old.user_id<>uid
      OR old.action<>p_action OR old.choice IS DISTINCT FROM p_choice
    THEN RAISE EXCEPTION 'event_id_conflict';END IF;
    RETURN old.receipt;
  END IF;
  IF r.status<>'active' OR r.expires_at<=now() THEN
    RAISE EXCEPTION 'run_closed_or_expired';END IF;
  IF p_action<>'answer' AND p_choice IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected_choice';END IF;
  q:=r.questions->r.next_index;
  IF q IS NULL THEN RAISE EXCEPTION 'run_complete';END IF;
  v_answer:=q->>'answer';
  IF p_action='fifty' THEN
    IF r.used_fifty THEN RAISE EXCEPTION 'fifty_already_used';END IF;
    SELECT pg_catalog.jsonb_agg(choice ORDER BY ord)
      INTO v_hidden FROM (
        SELECT choice,ord FROM
          pg_catalog.jsonb_array_elements_text(q->'options') WITH ORDINALITY t(choice,ord)
        WHERE choice<>v_answer ORDER BY ord LIMIT 2
      ) x;
    r.current_hidden:=v_hidden;
    r.used_fifty:=true;
  ELSIF p_action='audience' THEN
    IF r.used_audience THEN RAISE EXCEPTION 'audience_already_used';END IF;
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'choice',choice,'percent',CASE WHEN choice=v_answer THEN 64 ELSE 12 END
      ) ORDER BY ord) INTO v_audience
    FROM pg_catalog.jsonb_array_elements_text(q->'options')
      WITH ORDINALITY t(choice,ord);
    r.audience:=v_audience;
    r.used_audience:=true;
  ELSIF p_action='swap' THEN
    IF r.used_swap THEN RAISE EXCEPTION 'swap_already_used';END IF;
    v_reserve:=r.reserves->(r.next_index/5);
    IF v_reserve IS NULL THEN RAISE EXCEPTION 'replacement_unavailable';END IF;
    r.questions:=pg_catalog.jsonb_set(r.questions,
      ARRAY[r.next_index::text],v_reserve,false);
    r.current_hidden:='[]'::jsonb;
    r.audience:=NULL;
    r.used_swap:=true;
  ELSIF p_action='cashout' THEN
    r.status:='cashed';r.payout:=r.banked;r.completed_at:=now();
  ELSIF p_action='answer' THEN
    IF p_choice IS NULL OR pg_catalog.length(p_choice)>160
      OR NOT ((q->'options') ? p_choice)
      OR (r.current_hidden ? p_choice)
    THEN RAISE EXCEPTION 'invalid_choice';END IF;
    v_correct:=(p_choice=v_answer);
    v_correct_answer:=v_answer;
    IF v_correct THEN
      r.next_index:=r.next_index+1;
      r.banked:=v_ladder[r.next_index];
      IF r.next_index=15 THEN
        r.status:='won';r.payout:=r.banked;r.completed_at:=now();
      END IF;
    ELSE
      r.status:='lost';
      r.payout:=CASE WHEN r.next_index>=10 THEN 32000
                 WHEN r.next_index>=5 THEN 1000 ELSE 0 END;
      r.completed_at:=now();
    END IF;
    r.current_hidden:='[]'::jsonb;
    r.audience:=NULL;
  END IF;
  UPDATE arcade_private.quizoria_million_runs SET
    questions=r.questions,next_index=r.next_index,
    current_hidden=r.current_hidden,audience=r.audience,
    used_fifty=r.used_fifty,used_audience=r.used_audience,
    used_swap=r.used_swap,banked=r.banked,payout=r.payout,
    status=r.status,completed_at=r.completed_at
  WHERE run_id=r.run_id;
  IF r.status IN ('won','lost','cashed') THEN
    v_settle:=arcade_private.quizoria_million_credit(r.run_id);
  END IF;
  v_receipt:=arcade_private.quizoria_million_view(r);
  IF p_action='answer' THEN
    v_receipt:=v_receipt || pg_catalog.jsonb_build_object(
      'answered',true,'was_correct',v_correct,
      'correct_answer',v_correct_answer
    );
  END IF;
  INSERT INTO arcade_private.quizoria_million_actions(
    event_id,run_id,user_id,action,choice,receipt
  ) VALUES(p_event_id,r.run_id,uid,p_action,p_choice,v_receipt);
  RETURN v_receipt;
END;
$$;
REVOKE ALL ON FUNCTION public.quizoria_million_act(uuid,uuid,text,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_million_act(uuid,uuid,text,text)
  TO authenticated;

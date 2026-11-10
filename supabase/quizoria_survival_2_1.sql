-- Quizoria Survival 2.1: fully server-authoritative runs.
-- Additive deployment: existing games, wallets, missions and progress untouched.
-- DO NOT expose arcade_private tables through the Data API.
CREATE TABLE IF NOT EXISTS arcade_private.quizoria_survival_runs (
 run_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 operation_id uuid NOT NULL,
 category text NOT NULL CHECK (category IN ('video-games','memes','movies','music','general','mix')),
 questions jsonb NOT NULL CHECK (jsonb_typeof(questions)='array' AND jsonb_array_length(questions)=60),
 next_index integer NOT NULL DEFAULT 0 CHECK (next_index BETWEEN 0 AND 60),
 lives integer NOT NULL DEFAULT 3 CHECK (lives BETWEEN 0 AND 3),
 correct integer NOT NULL DEFAULT 0 CHECK (correct BETWEEN 0 AND 60),
 score integer NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 99999),
 streak integer NOT NULL DEFAULT 0 CHECK (streak BETWEEN 0 AND 60),
 best_streak integer NOT NULL DEFAULT 0 CHECK (best_streak BETWEEN 0 AND 60),
 finished boolean NOT NULL DEFAULT false,
 started_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
 finished_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,operation_id)
);
CREATE INDEX IF NOT EXISTS quizoria_survival_owner_active_idx
 ON arcade_private.quizoria_survival_runs(user_id,category,started_at DESC);
CREATE INDEX IF NOT EXISTS quizoria_survival_leaderboard_idx
 ON arcade_private.quizoria_survival_runs(category,score DESC) WHERE finished;
ALTER TABLE arcade_private.quizoria_survival_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_survival_runs FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS arcade_private.quizoria_survival_events (
 event_id uuid PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES arcade_private.quizoria_survival_runs(run_id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 index_at_answer integer NOT NULL,
 choice integer NOT NULL CHECK (choice BETWEEN 0 AND 3),
 receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,index_at_answer)
);
CREATE INDEX IF NOT EXISTS quizoria_survival_events_user_idx
 ON arcade_private.quizoria_survival_events(user_id,run_id);
ALTER TABLE arcade_private.quizoria_survival_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_survival_events FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS arcade_private.quizoria_survival_rewards (
 run_id uuid PRIMARY KEY REFERENCES arcade_private.quizoria_survival_runs(run_id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 xp integer NOT NULL DEFAULT 0 CHECK (xp BETWEEN 0 AND 30),
 crowns integer NOT NULL DEFAULT 0 CHECK (crowns BETWEEN 0 AND 1),
 shards integer NOT NULL DEFAULT 0 CHECK (shards=0),
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quizoria_survival_rewards_limit_idx
 ON arcade_private.quizoria_survival_rewards(user_id,created_at DESC);
ALTER TABLE arcade_private.quizoria_survival_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_survival_rewards FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION arcade_private.quizoria_survival_video_options(
 p_answer text,p_wrong text[],p_id text,p_seed text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=''
AS $fn$
DECLARE idx integer; i integer; chosen text; output jsonb:='[]'::jsonb;
BEGIN
 idx:=pg_catalog.get_byte(pg_catalog.decode(pg_catalog.substr(pg_catalog.md5(p_seed||p_id),1,2),'hex'),0)%4;
 FOR i IN 0..3 LOOP
  chosen:=CASE WHEN i=idx THEN p_answer ELSE p_wrong[ ((i-idx+4)%4) ] END;
  output:=output||pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('cs',chosen,'en',chosen,'key',i));
 END LOOP;
 RETURN pg_catalog.jsonb_build_object('options',output,'answer_index',idx);
END;
$fn$;

CREATE OR REPLACE FUNCTION arcade_private.quizoria_survival_pick(
 p_category text,p_operation uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=''
AS $fn$
WITH all_questions AS (
 SELECT 'video-games'::text category,q.id,q.difficulty,
  pg_catalog.jsonb_build_object(
   'category','video-games','difficulty',q.difficulty,
   'prompt_cs',t.cs,'prompt_en',t.en,
   'clue_cs',coalesce(t.clues_cs[1],''),'clue_en',coalesce(t.clues_en[1],''),
   'visual',null,'media_type','text','source_url',null,
   'author',null,'license',null
  ) || arcade_private.quizoria_survival_video_options(q.answer,q.wrong,q.id,p_operation::text) payload
 FROM arcade_private.quiz_questions q
 JOIN arcade_private.quiz_question_texts t ON t.id=q.id
 WHERE q.pool='secure' AND pg_catalog.array_length(q.wrong,1)>=3
 UNION ALL
 SELECT 'memes',m.id,m.difficulty,pg_catalog.jsonb_build_object(
  'category','memes','difficulty',m.difficulty,
  'prompt_cs',m.prompt_cs,'prompt_en',m.prompt_en,
  'clue_cs','','clue_en','','visual',m.image_url,
  'media_type','image','source_url',m.source_url,'author',m.author,'license',m.license,
  'options',m.options,'answer_index',m.answer_index)
 FROM arcade_private.quizoria_meme_questions m
 UNION ALL
 SELECT 'movies',m.id,m.difficulty,pg_catalog.jsonb_build_object(
  'category','movies','difficulty',m.difficulty,
  'prompt_cs',m.prompt_cs,'prompt_en',m.prompt_en,
  'clue_cs',m.clue_cs,'clue_en',m.clue_en,'visual',m.visual,
  'media_type',m.media_type,'source_url',m.source_url,'author',m.author,'license',m.license,
  'options',m.options,'answer_index',m.answer_index)
 FROM arcade_private.quizoria_movie_questions m
 UNION ALL
 SELECT 'music',m.id,m.difficulty,pg_catalog.jsonb_build_object(
  'category','music','difficulty',m.difficulty,
  'prompt_cs',m.prompt_cs,'prompt_en',m.prompt_en,
  'clue_cs',m.clue_cs,'clue_en',m.clue_en,'visual',m.visual,
  'media_type',m.media_type,'source_url',m.source_url,'author',m.author,'license',m.license,
  'options',m.options,'answer_index',m.answer_index)
 FROM arcade_private.quizoria_music_questions m
 UNION ALL
 SELECT 'general',m.id,m.difficulty,pg_catalog.jsonb_build_object(
  'category','general','difficulty',m.difficulty,
  'prompt_cs',m.prompt_cs,'prompt_en',m.prompt_en,
  'clue_cs',m.clue_cs,'clue_en',m.clue_en,'visual',m.visual,
  'media_type',m.media_type,'source_url',m.source_url,'author',m.author,'license',m.license,
  'options',m.options,'answer_index',m.answer_index)
 FROM arcade_private.quizoria_general_questions m
), per_category AS (
 SELECT a.*,
  pg_catalog.row_number() OVER(
    PARTITION BY category,difficulty
    ORDER BY pg_catalog.md5(p_operation::text||':'||id)
  ) local_rank
 FROM all_questions a
 WHERE p_category='mix' OR category=p_category
), ordered AS (
 SELECT p.*,
  pg_catalog.row_number() OVER(
   PARTITION BY difficulty
   ORDER BY local_rank,pg_catalog.md5(p_operation::text||':'||category||':'||id)
  ) slot
 FROM per_category p
)
SELECT coalesce(pg_catalog.jsonb_agg(payload ORDER BY
 CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,slot),'[]'::jsonb)
FROM ordered WHERE difficulty IN ('easy','medium','hard') AND slot<=20;
$fn$;

CREATE OR REPLACE FUNCTION arcade_private.quizoria_survival_view(
 p_run arcade_private.quizoria_survival_runs)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=''
AS $fn$
DECLARE q jsonb; reward jsonb; expired boolean;
BEGIN
 expired:=p_run.expires_at<=now() AND NOT p_run.finished;
 IF NOT p_run.finished AND NOT expired AND p_run.next_index<60 THEN
  q:=p_run.questions->p_run.next_index;
 END IF;
 SELECT pg_catalog.jsonb_build_object('xp',xp,'crowns',crowns,'shards',shards,'reason',reason)
  INTO reward FROM arcade_private.quizoria_survival_rewards WHERE run_id=p_run.run_id;
 RETURN pg_catalog.jsonb_build_object(
  'ok',true,'has_run',true,'run_id',p_run.run_id,
  'category',p_run.category,'stage',p_run.next_index,'total',60,
  'score',p_run.score,'correct',p_run.correct,'lives',p_run.lives,
  'streak',p_run.streak,'best_streak',p_run.best_streak,
  'finished',p_run.finished,'expired',expired,'expires_at',p_run.expires_at,
  'reward',reward,
  'question',CASE WHEN q IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
    'category',q->>'category','difficulty',q->>'difficulty',
    'prompt_cs',q->>'prompt_cs','prompt_en',q->>'prompt_en',
    'clue_cs',q->>'clue_cs','clue_en',q->>'clue_en',
    'visual',q->>'visual','media_type',q->>'media_type',
    'source_url',q->>'source_url','author',q->>'author','license',q->>'license',
    'options',q->'options'
  ) END
 );
END;
$fn$;

CREATE OR REPLACE FUNCTION arcade_private.quizoria_survival_credit(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_survival_runs%rowtype;
 m arcade_private.quiz_reward_modes%rowtype;w public.arcade_wallets%rowtype;
 previous arcade_private.quizoria_survival_rewards%rowtype;
 v_xp integer:=0;v_crowns integer:=0;reason text:='below_threshold';
 hourly int:=0;daily int:=0;v_legacy int:=0;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 SELECT * INTO r FROM arcade_private.quizoria_survival_runs
  WHERE run_id=p_run_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND OR NOT r.finished THEN RAISE EXCEPTION 'run_not_finished';END IF;
 SELECT * INTO previous FROM arcade_private.quizoria_survival_rewards WHERE run_id=p_run_id;
 IF FOUND THEN
  RETURN pg_catalog.jsonb_build_object('xp',previous.xp,'crowns',previous.crowns,
   'shards',0,'reason',previous.reason);
 END IF;
 IF r.next_index>=5 AND r.correct>=3 THEN
  v_xp:=least(30,greatest(5,r.correct*2));
  IF r.next_index>=20 AND r.correct>=15 THEN v_crowns:=1;END IF;
 END IF;
 INSERT INTO public.arcade_wallets(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
 SELECT * INTO w FROM public.arcade_wallets WHERE user_id=uid FOR UPDATE;
 SELECT * INTO m FROM arcade_private.quiz_reward_modes WHERE user_id=uid FOR UPDATE;
 IF v_xp=0 THEN reason:='below_threshold';
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
  INTO hourly,daily FROM arcade_private.quizoria_survival_rewards
  WHERE user_id=uid AND xp>0;
  -- Conservative per-mode limits: at most 1 funded Survival run/hour, 2/day.
  IF hourly>=1 OR daily>=2 THEN reason:='daily_limit';
  ELSIF w.crowns+v_crowns>1000000000 THEN reason:='wallet_limit';
  ELSE reason:='credited';END IF;
 END IF;
 IF reason<>'credited' THEN v_xp:=0;v_crowns:=0;END IF;
 INSERT INTO arcade_private.quizoria_survival_rewards(run_id,user_id,xp,crowns,shards,reason)
 VALUES(p_run_id,uid,v_xp,v_crowns,0,reason);
 IF reason='credited' THEN
  INSERT INTO public.arcade_profiles(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
  UPDATE public.arcade_profiles SET arcade_xp=arcade_xp+v_xp,updated_at=now()
    WHERE user_id=uid;
  UPDATE public.arcade_wallets SET crowns=crowns+v_crowns,updated_at=now()
    WHERE user_id=uid;
  UPDATE arcade_private.quiz_reward_modes SET
    verified_xp=verified_xp+v_xp,updated_at=now() WHERE user_id=uid;
  INSERT INTO public.arcade_wallet_events(operation_id,user_id,kind,details)
   VALUES(p_run_id,uid,'game_earnings',
    pg_catalog.jsonb_build_object('source','quizoria-survival-v1','run_id',p_run_id,
      'xp',v_xp,'crowns',v_crowns,'shards',0));
 END IF;
 RETURN pg_catalog.jsonb_build_object('xp',v_xp,'crowns',v_crowns,'shards',0,'reason',reason);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.quizoria_survival_begin(
 p_category text,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_survival_runs%rowtype;
 deck jsonb; run_count integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 IF p_operation IS NULL OR p_category IS NULL OR
    p_category NOT IN ('video-games','memes','movies','music','general','mix')
  THEN RAISE EXCEPTION 'invalid_request';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,20261201));
 SELECT * INTO r FROM arcade_private.quizoria_survival_runs
  WHERE user_id=uid AND operation_id=p_operation;
 IF FOUND THEN
  IF r.category<>p_category THEN RAISE EXCEPTION 'operation_conflict';END IF;
  RETURN arcade_private.quizoria_survival_view(r);
 END IF;
 -- A new operation UUID always starts a NEW run. Never silently return an
 -- unrelated active save. Those remain available via resume/history.
 -- Retrying the SAME operation UUID is still idempotent above.
 SELECT count(*) INTO run_count FROM arcade_private.quizoria_survival_runs
  WHERE user_id=uid AND started_at>now()-interval '1 hour';
 IF run_count>=10 THEN RAISE EXCEPTION 'rate_limited';END IF;
 deck:=arcade_private.quizoria_survival_pick(p_category,p_operation);
 IF deck IS NULL OR pg_catalog.jsonb_array_length(deck)<>60
 THEN RAISE EXCEPTION 'survival_question_bank_incomplete';END IF;
 INSERT INTO arcade_private.quizoria_survival_runs(user_id,operation_id,category,questions)
 VALUES(uid,p_operation,p_category,deck) RETURNING * INTO r;
 RETURN arcade_private.quizoria_survival_view(r);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.quizoria_survival_resume(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_survival_runs%rowtype;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 SELECT * INTO r FROM arcade_private.quizoria_survival_runs
  WHERE run_id=p_run_id AND user_id=uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'run_not_yours';END IF;
 RETURN arcade_private.quizoria_survival_view(r);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.quizoria_survival_answer(
 p_run_id uuid,p_event_id uuid,p_choice integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_survival_runs%rowtype;
 existing arcade_private.quizoria_survival_events%rowtype;
 q jsonb;was_right boolean;answer_index integer;receipt jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 IF p_run_id IS NULL OR p_event_id IS NULL OR p_choice IS NULL OR
    p_choice NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'invalid_answer';END IF;
 SELECT * INTO r FROM arcade_private.quizoria_survival_runs
  WHERE run_id=p_run_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'run_not_yours';END IF;
 SELECT * INTO existing FROM arcade_private.quizoria_survival_events
  WHERE event_id=p_event_id;
 IF FOUND THEN
  IF existing.run_id<>p_run_id OR existing.user_id<>uid OR existing.choice<>p_choice
  THEN RAISE EXCEPTION 'event_id_conflict';END IF;
  RETURN existing.receipt;
 END IF;
 IF r.finished OR r.expires_at<=now() OR r.next_index>=60
 THEN RAISE EXCEPTION 'run_finished_or_expired';END IF;
 q:=r.questions->r.next_index;
 answer_index:=(q->>'answer_index')::integer;
 IF answer_index NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'invalid_question';END IF;
 was_right:=p_choice=answer_index;
 r.next_index:=r.next_index+1;
 IF was_right THEN
  r.correct:=r.correct+1;
  r.streak:=r.streak+1;
  r.best_streak:=greatest(r.best_streak,r.streak);
  r.score:=r.score+10+least(r.streak,10)*2;
 ELSE r.lives:=r.lives-1;r.streak:=0;END IF;
 r.finished:=r.lives=0 OR r.next_index>=60;
 UPDATE arcade_private.quizoria_survival_runs
 SET next_index=r.next_index,score=r.score,correct=r.correct,
  lives=r.lives,streak=r.streak,best_streak=r.best_streak,
  finished=r.finished,updated_at=now(),
  finished_at=CASE WHEN r.finished THEN now() ELSE NULL END
 WHERE run_id=r.run_id;
 IF r.finished THEN PERFORM arcade_private.quizoria_survival_credit(r.run_id);END IF;
 receipt:=arcade_private.quizoria_survival_view(r) ||
  pg_catalog.jsonb_build_object('answered',true,'was_correct',was_right,
     'correct_option',answer_index);
 INSERT INTO arcade_private.quizoria_survival_events
   (event_id,run_id,user_id,index_at_answer,choice,receipt)
 VALUES(p_event_id,p_run_id,uid,r.next_index-1,p_choice,receipt);
 RETURN receipt;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.quizoria_survival_lobby(p_category text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE uid uuid:=auth.uid();active arcade_private.quizoria_survival_runs%rowtype;
 history jsonb;leaders jsonb;best_score int:=0;best_stage int:=0;v_best_streak int:=0;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 IF p_category IS NULL OR
  p_category NOT IN ('video-games','memes','movies','music','general','mix')
 THEN RAISE EXCEPTION 'invalid_category';END IF;
 SELECT * INTO active FROM arcade_private.quizoria_survival_runs
  WHERE user_id=uid AND category=p_category AND NOT finished AND expires_at>now()
  ORDER BY started_at DESC LIMIT 1;
 SELECT coalesce(max(r.score),0),coalesce(max(r.next_index),0),coalesce(max(r.best_streak),0)
 INTO best_score,best_stage,v_best_streak
 FROM arcade_private.quizoria_survival_runs AS r
 WHERE r.user_id=uid AND r.category=p_category;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'run_id',run_id,'category',category,'stage',next_index,'score',score,
  'correct',correct,'lives',lives,'finished',finished,'expires_at',expires_at,
  'started_at',started_at) ORDER BY started_at DESC),'[]'::jsonb)
 INTO history FROM (
  SELECT run_id,category,next_index,score,correct,lives,finished,expires_at,started_at
  FROM arcade_private.quizoria_survival_runs WHERE user_id=uid AND category=p_category
  ORDER BY started_at DESC LIMIT 10
 ) recent;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'nickname',nickname,'score',score,'stage',stage,'category',p_category)
   ORDER BY score DESC,stage DESC),'[]'::jsonb)
 INTO leaders FROM (
  SELECT coalesce(nullif(p.nickname,''),'Hráč') nickname,
     max(r.score) score,max(r.next_index) stage
  FROM arcade_private.quizoria_survival_runs r
  JOIN public.arcade_profiles p ON p.user_id=r.user_id
  WHERE r.category=p_category AND r.finished=true
  GROUP BY r.user_id,p.nickname ORDER BY score DESC,stage DESC LIMIT 10
 ) leaderboard;
 RETURN pg_catalog.jsonb_build_object('ok',true,'category',p_category,
  'active',CASE WHEN active.run_id IS NULL THEN null
     ELSE arcade_private.quizoria_survival_view(active) END,
  'best',pg_catalog.jsonb_build_object('score',best_score,'stage',best_stage,'streak',v_best_streak),
  'runs',history,'leaderboard',leaders);
END;
$fn$;

-- Explicit RPC grants; nobody can read/modify private tables or private helpers.
REVOKE ALL ON FUNCTION arcade_private.quizoria_survival_video_options(text,text[],text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.quizoria_survival_pick(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.quizoria_survival_view(arcade_private.quizoria_survival_runs) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.quizoria_survival_credit(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.quizoria_survival_begin(text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.quizoria_survival_resume(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.quizoria_survival_answer(uuid,uuid,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.quizoria_survival_lobby(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_survival_begin(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quizoria_survival_resume(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quizoria_survival_answer(uuid,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quizoria_survival_lobby(text) TO authenticated;

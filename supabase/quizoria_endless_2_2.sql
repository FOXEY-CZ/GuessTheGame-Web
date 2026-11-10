-- Quizoria Endless 2.2 — independent, server-authoritative endless quiz.
-- Additive migration. Do not mutate Survival or existing games/saves.
CREATE TABLE IF NOT EXISTS arcade_private.quizoria_endless_runs(
 run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 operation_id uuid NOT NULL,
 category text NOT NULL CHECK(category IN ('video-games','memes','movies','music','general','mix')),
 question jsonb NOT NULL,
 seen jsonb NOT NULL DEFAULT '{"easy":[],"medium":[],"hard":[]}'::jsonb,
 answered integer NOT NULL DEFAULT 0 CHECK(answered BETWEEN 0 AND 2000000000),
 correct integer NOT NULL DEFAULT 0 CHECK(correct >=0),
 score bigint NOT NULL DEFAULT 0 CHECK(score>=0),
 streak integer NOT NULL DEFAULT 0 CHECK(streak>=0),
 best_streak integer NOT NULL DEFAULT 0 CHECK(best_streak>=0),
 rating integer NOT NULL DEFAULT 25 CHECK(rating BETWEEN 0 AND 100),
 cycles integer NOT NULL DEFAULT 0 CHECK(cycles>=0),
 finished boolean NOT NULL DEFAULT false,
 started_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 UNIQUE(user_id,operation_id)
);
CREATE INDEX IF NOT EXISTS quizoria_endless_runs_owner_idx ON arcade_private.quizoria_endless_runs(user_id,category,started_at DESC);
CREATE INDEX IF NOT EXISTS quizoria_endless_runs_ranking_idx ON arcade_private.quizoria_endless_runs(category,score DESC) WHERE finished;
ALTER TABLE arcade_private.quizoria_endless_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_endless_runs FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS arcade_private.quizoria_endless_events(
 event_id uuid PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES arcade_private.quizoria_endless_runs(run_id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 index_at_answer integer NOT NULL,
 choice integer NOT NULL CHECK(choice BETWEEN 0 AND 3),
 receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,index_at_answer)
);
ALTER TABLE arcade_private.quizoria_endless_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_endless_events FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS arcade_private.quizoria_endless_rewards(
 run_id uuid PRIMARY KEY REFERENCES arcade_private.quizoria_endless_runs(run_id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 xp integer NOT NULL DEFAULT 0 CHECK(xp BETWEEN 0 AND 30),
 crowns integer NOT NULL DEFAULT 0 CHECK(crowns BETWEEN 0 AND 1),
 shards integer NOT NULL DEFAULT 0 CHECK(shards=0),
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quizoria_endless_rewards_user_idx ON arcade_private.quizoria_endless_rewards(user_id,created_at DESC);
ALTER TABLE arcade_private.quizoria_endless_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_endless_rewards FROM PUBLIC,anon,authenticated;

-- Private full question catalog; includes canonical IDs + correct answers.
-- Public clients never receive this function or its raw results.
CREATE OR REPLACE FUNCTION arcade_private.quizoria_endless_pool(
 p_category text,p_difficulty text,p_seed text)
RETURNS TABLE(question_key text,payload jsonb)
LANGUAGE sql STABLE SET search_path=''
AS $fn$
WITH all_questions AS(
 SELECT 'video-games'::text AS category,q.id,q.difficulty,
  pg_catalog.jsonb_build_object(
   'category','video-games','difficulty',q.difficulty,'prompt_cs',t.cs,'prompt_en',t.en,
   'clue_cs',coalesce(t.clues_cs[1],''),'clue_en',coalesce(t.clues_en[1],''),
   'visual',null,'media_type','text','source_url',null,'author',null,'license',null
  ) || arcade_private.quizoria_survival_video_options(q.answer,q.wrong,q.id,p_seed) AS question
 FROM arcade_private.quiz_questions q JOIN arcade_private.quiz_question_texts t ON t.id=q.id
 WHERE q.pool='secure' AND pg_catalog.array_length(q.wrong,1)>=3
 UNION ALL
 SELECT 'memes',m.id,m.difficulty,pg_catalog.jsonb_build_object(
  'category','memes','difficulty',m.difficulty,'prompt_cs',m.prompt_cs,'prompt_en',m.prompt_en,
  'clue_cs','','clue_en','','visual',m.image_url,'media_type','image',
  'source_url',m.source_url,'author',m.author,'license',m.license,
  'options',m.options,'answer_index',m.answer_index)
 FROM arcade_private.quizoria_meme_questions m
 UNION ALL
 SELECT 'movies',m.id,m.difficulty,pg_catalog.jsonb_build_object(
  'category','movies','difficulty',m.difficulty,'prompt_cs',m.prompt_cs,'prompt_en',m.prompt_en,
  'clue_cs',m.clue_cs,'clue_en',m.clue_en,'visual',m.visual,'media_type',m.media_type,
  'source_url',m.source_url,'author',m.author,'license',m.license,
  'options',m.options,'answer_index',m.answer_index)
 FROM arcade_private.quizoria_movie_questions m
 UNION ALL
 SELECT 'music',m.id,m.difficulty,pg_catalog.jsonb_build_object(
  'category','music','difficulty',m.difficulty,'prompt_cs',m.prompt_cs,'prompt_en',m.prompt_en,
  'clue_cs',m.clue_cs,'clue_en',m.clue_en,'visual',m.visual,'media_type',m.media_type,
  'source_url',m.source_url,'author',m.author,'license',m.license,
  'options',m.options,'answer_index',m.answer_index)
 FROM arcade_private.quizoria_music_questions m
 UNION ALL
 SELECT 'general',m.id,m.difficulty,pg_catalog.jsonb_build_object(
  'category','general','difficulty',m.difficulty,'prompt_cs',m.prompt_cs,'prompt_en',m.prompt_en,
  'clue_cs',m.clue_cs,'clue_en',m.clue_en,'visual',m.visual,'media_type',m.media_type,
  'source_url',m.source_url,'author',m.author,'license',m.license,
  'options',m.options,'answer_index',m.answer_index)
 FROM arcade_private.quizoria_general_questions m
)
SELECT (a.category||':'||a.id)::text AS question_key,
       (a.question||pg_catalog.jsonb_build_object('question_key',(a.category||':'||a.id))) AS payload
FROM all_questions a
WHERE (p_category='mix' OR a.category=p_category) AND a.difficulty=p_difficulty
AND pg_catalog.jsonb_array_length(a.question->'options')=4
AND (a.question->>'answer_index')::integer BETWEEN 0 AND 3;
$fn$;

-- Explicitly draw from unseen IDs in the selected difficulty.
-- On exhaustion cycle only that difficulty, not the other two.
CREATE OR REPLACE FUNCTION arcade_private.quizoria_endless_draw(
 p_category text,p_rating integer,p_seen jsonb,p_seed text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=''
AS $fn$
DECLARE difficulty text; chosen record; used jsonb; cycled boolean:=false;
BEGIN
 difficulty:=CASE WHEN p_rating<45 THEN 'easy' WHEN p_rating<80 THEN 'medium' ELSE 'hard' END;
 used:=coalesce(p_seen->difficulty,'[]'::jsonb);
 SELECT pool.question_key,pool.payload INTO chosen
 FROM arcade_private.quizoria_endless_pool(p_category,difficulty,p_seed) pool
 WHERE NOT (used ? pool.question_key)
 ORDER BY pg_catalog.md5(p_seed||pool.question_key) LIMIT 1;
 IF NOT FOUND THEN
  cycled:=true;
  SELECT pool.question_key,pool.payload INTO chosen
  FROM arcade_private.quizoria_endless_pool(p_category,difficulty,p_seed) pool
  ORDER BY pg_catalog.md5(p_seed||pool.question_key) LIMIT 1;
 END IF;
 IF chosen.payload IS NULL THEN RAISE EXCEPTION 'endless_question_bank_incomplete';END IF;
 RETURN pg_catalog.jsonb_build_object('question',chosen.payload,'key',chosen.question_key,
   'difficulty',difficulty,'cycled',cycled);
END;
$fn$;

CREATE OR REPLACE FUNCTION arcade_private.quizoria_endless_view(
 p_run arcade_private.quizoria_endless_runs)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=''
AS $fn$
DECLARE reward jsonb; public_q jsonb;
BEGIN
 SELECT pg_catalog.jsonb_build_object('xp',xp,'crowns',crowns,'reason',reason)
 INTO reward FROM arcade_private.quizoria_endless_rewards WHERE run_id=p_run.run_id;
 IF NOT p_run.finished THEN
  -- Strip private question_key and correct answer BEFORE returning the RPC.
  public_q:=p_run.question - 'answer_index' - 'question_key';
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'ok',true,'has_run',true,'run_id',p_run.run_id,'category',p_run.category,
  'stage',p_run.answered,'correct',p_run.correct,'score',p_run.score,
  'streak',p_run.streak,'multiplier',1+least(p_run.streak/3,4),
  'best_streak',p_run.best_streak,'rating',p_run.rating,
  'cycles',p_run.cycles,'finished',p_run.finished,'question',public_q,'reward',reward);
END;
$fn$;

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

CREATE OR REPLACE FUNCTION public.quizoria_endless_begin(
 p_category text,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_endless_runs%rowtype;
 draw jsonb;seen jsonb;run_count int;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 IF p_operation IS NULL OR p_category NOT IN ('video-games','memes','movies','music','general','mix')
 THEN RAISE EXCEPTION 'invalid_request';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,20261202));
 SELECT * INTO r FROM arcade_private.quizoria_endless_runs WHERE user_id=uid AND operation_id=p_operation;
 IF FOUND THEN
  IF r.category<>p_category THEN RAISE EXCEPTION 'operation_conflict';END IF;
  RETURN arcade_private.quizoria_endless_view(r);
 END IF;
 SELECT count(*) INTO run_count FROM arcade_private.quizoria_endless_runs
 WHERE user_id=uid AND started_at>now()-interval '1 hour';
 IF run_count>=10 THEN RAISE EXCEPTION 'rate_limited';END IF;
 draw:=arcade_private.quizoria_endless_draw(p_category,25,'{"easy":[],"medium":[],"hard":[]}'::jsonb,p_operation::text);
 seen:=pg_catalog.jsonb_build_object('easy',pg_catalog.jsonb_build_array(draw->>'key'),
   'medium','[]'::jsonb,'hard','[]'::jsonb);
 INSERT INTO arcade_private.quizoria_endless_runs(user_id,operation_id,category,question,seen)
 VALUES(uid,p_operation,p_category,draw->'question',seen) RETURNING * INTO r;
 RETURN arcade_private.quizoria_endless_view(r);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.quizoria_endless_resume(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_endless_runs%rowtype;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 SELECT * INTO r FROM arcade_private.quizoria_endless_runs WHERE run_id=p_run_id AND user_id=uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'run_not_yours';END IF;
 RETURN arcade_private.quizoria_endless_view(r);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.quizoria_endless_answer(
 p_run_id uuid,p_event_id uuid,p_choice integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_endless_runs%rowtype;
 previous arcade_private.quizoria_endless_events%rowtype;
 right_answer int;was_right boolean;current_difficulty text;
 selected jsonb;next_q jsonb;seen_next jsonb;next_difficulty text;
 score_increment int;receipt jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 IF p_run_id IS NULL OR p_event_id IS NULL OR p_choice NOT BETWEEN 0 AND 3
 THEN RAISE EXCEPTION 'invalid_answer';END IF;
 SELECT * INTO r FROM arcade_private.quizoria_endless_runs
 WHERE run_id=p_run_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'run_not_yours';END IF;
 SELECT * INTO previous FROM arcade_private.quizoria_endless_events WHERE event_id=p_event_id;
 IF FOUND THEN
  IF previous.user_id<>uid OR previous.run_id<>p_run_id OR previous.choice<>p_choice
  THEN RAISE EXCEPTION 'event_id_conflict';END IF;
  RETURN previous.receipt;
 END IF;
 IF r.finished THEN RAISE EXCEPTION 'run_finished';END IF;
 IF r.answered>=2000000000 OR r.score>9000000000000000
 THEN RAISE EXCEPTION 'run_maximum_reached';END IF;
 right_answer:=(r.question->>'answer_index')::int;
 current_difficulty:=r.question->>'difficulty';
 IF right_answer NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'invalid_question';END IF;
 was_right:=p_choice=right_answer;
 r.answered:=r.answered+1;
 IF was_right THEN
  r.correct:=r.correct+1;
  r.streak:=r.streak+1;r.best_streak:=greatest(r.best_streak,r.streak);
  r.rating:=least(100,r.rating+CASE current_difficulty WHEN 'easy' THEN 10 WHEN 'medium' THEN 7 ELSE 4 END);
  score_increment:=(CASE current_difficulty WHEN 'easy' THEN 10 WHEN 'medium' THEN 20 ELSE 30 END)
   *(1+least(r.streak/3,4));
  r.score:=r.score+score_increment;
 ELSE
  r.streak:=0;r.rating:=greatest(0,r.rating-
   CASE current_difficulty WHEN 'easy' THEN 8 WHEN 'medium' THEN 12 ELSE 15 END);
 END IF;
 selected:=arcade_private.quizoria_endless_draw(r.category,r.rating,r.seen,
   r.operation_id::text||':'||r.answered::text);
 next_difficulty:=selected->>'difficulty';
 seen_next:=r.seen;
 IF (selected->>'cycled')::boolean THEN
  seen_next:=pg_catalog.jsonb_set(seen_next,ARRAY[next_difficulty],'[]'::jsonb,true);
  r.cycles:=r.cycles+1;
 END IF;
 seen_next:=pg_catalog.jsonb_set(seen_next,ARRAY[next_difficulty],
  coalesce(seen_next->next_difficulty,'[]'::jsonb)||pg_catalog.jsonb_build_array(selected->>'key'),true);
 r.seen:=seen_next;
 r.question:=selected->'question';
 UPDATE arcade_private.quizoria_endless_runs SET
  question=r.question,seen=r.seen,answered=r.answered,correct=r.correct,
  score=r.score,streak=r.streak,best_streak=r.best_streak,
  rating=r.rating,cycles=r.cycles,updated_at=now()
 WHERE run_id=r.run_id;
 receipt:=arcade_private.quizoria_endless_view(r)||
  pg_catalog.jsonb_build_object('answered',true,'was_correct',was_right,'correct_option',right_answer);
 INSERT INTO arcade_private.quizoria_endless_events(event_id,run_id,user_id,index_at_answer,choice,receipt)
 VALUES(p_event_id,p_run_id,uid,r.answered-1,p_choice,receipt);
 RETURN receipt;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.quizoria_endless_finish(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_endless_runs%rowtype;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 IF p_run_id IS NULL THEN RAISE EXCEPTION 'invalid_request';END IF;
 SELECT * INTO r FROM arcade_private.quizoria_endless_runs
 WHERE run_id=p_run_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'run_not_yours';END IF;
 IF NOT r.finished THEN
  UPDATE arcade_private.quizoria_endless_runs SET finished=true,finished_at=now(),updated_at=now()
  WHERE run_id=r.run_id RETURNING * INTO r;
 END IF;
 PERFORM arcade_private.quizoria_endless_credit(r.run_id);
 RETURN arcade_private.quizoria_endless_view(r);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.quizoria_endless_lobby(p_category text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE uid uuid:=auth.uid();active arcade_private.quizoria_endless_runs%rowtype;
 records jsonb;leaderboard jsonb;best_score bigint:=0;best_stage int:=0;best_streak_value int:=0;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 IF p_category NOT IN ('video-games','memes','movies','music','general','mix')
 THEN RAISE EXCEPTION 'invalid_category';END IF;
 SELECT * INTO active FROM arcade_private.quizoria_endless_runs r
 WHERE r.user_id=uid AND r.category=p_category AND NOT r.finished
 ORDER BY r.started_at DESC LIMIT 1;
 SELECT coalesce(max(r.score),0),coalesce(max(r.answered),0),coalesce(max(r.best_streak),0)
 INTO best_score,best_stage,best_streak_value FROM arcade_private.quizoria_endless_runs r
 WHERE r.user_id=uid AND r.category=p_category;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'run_id',x.run_id,'stage',x.answered,'score',x.score,'correct',x.correct,
  'streak',x.streak,'rating',x.rating,'finished',x.finished,
  'started_at',x.started_at) ORDER BY x.started_at DESC),'[]'::jsonb)
 INTO records
 FROM(SELECT run_id,answered,score,correct,streak,rating,finished,started_at
  FROM arcade_private.quizoria_endless_runs WHERE user_id=uid AND category=p_category
  ORDER BY started_at DESC LIMIT 12)x;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'nickname',l.nickname,'score',l.score,'stage',l.stage,'streak',l.streak)
  ORDER BY l.score DESC,l.stage DESC),'[]'::jsonb)
 INTO leaderboard
 FROM(
  SELECT coalesce(nullif(p.nickname,''),'Hráč') nickname,
   r.score AS score,r.answered AS stage,r.best_streak AS streak
  FROM (
   SELECT DISTINCT ON (user_id) user_id,score,answered,best_streak
   FROM arcade_private.quizoria_endless_runs
   WHERE category=p_category AND finished
   ORDER BY user_id,score DESC,answered DESC,started_at DESC
  ) r
  JOIN public.arcade_profiles p ON p.user_id=r.user_id
  ORDER BY r.score DESC,r.answered DESC LIMIT 10
 )l;
 RETURN pg_catalog.jsonb_build_object('ok',true,'category',p_category,
  'active',CASE WHEN active.run_id IS NULL THEN NULL ELSE arcade_private.quizoria_endless_view(active) END,
  'best',pg_catalog.jsonb_build_object('score',best_score,'stage',best_stage,'streak',best_streak_value),
  'runs',records,'leaderboard',leaderboard);
END;
$fn$;

REVOKE ALL ON FUNCTION arcade_private.quizoria_endless_pool(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.quizoria_endless_draw(text,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.quizoria_endless_view(arcade_private.quizoria_endless_runs) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.quizoria_endless_credit(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.quizoria_endless_begin(text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.quizoria_endless_resume(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.quizoria_endless_answer(uuid,uuid,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.quizoria_endless_finish(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.quizoria_endless_lobby(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_endless_begin(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quizoria_endless_resume(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quizoria_endless_answer(uuid,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quizoria_endless_finish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quizoria_endless_lobby(text) TO authenticated;

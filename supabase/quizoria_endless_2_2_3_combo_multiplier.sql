-- Quizoria Endless 2.2.3 — real server-calculated streak multipliers.
-- 1× baseline, 2× at 3 correct, 3× at 6, 4× at 9, 5× at 12+.
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

REVOKE ALL ON FUNCTION arcade_private.quizoria_endless_view(arcade_private.quizoria_endless_runs) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.quizoria_endless_answer(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_endless_answer(uuid,uuid,integer) TO authenticated;

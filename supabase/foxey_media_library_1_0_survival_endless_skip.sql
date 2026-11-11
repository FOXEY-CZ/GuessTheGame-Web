-- FOXEY Arcade Media Library: skip quarantined images in Survival and Endless.
-- Sentinal p_choice=4 is allowed only for previously saved unapproved meme images;
-- no score, streak, lives or rating penalty. Normal 0-3 behavior is unchanged.
CREATE OR REPLACE FUNCTION public.quizoria_survival_answer(p_run_id uuid, p_event_id uuid, p_choice integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_survival_runs%rowtype;
 existing arcade_private.quizoria_survival_events%rowtype;
 q jsonb;was_right boolean;answer_index integer;receipt jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 IF p_run_id IS NULL OR p_event_id IS NULL OR p_choice IS NULL OR
    p_choice NOT BETWEEN 0 AND 4 THEN RAISE EXCEPTION 'invalid_answer';END IF;
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
 IF p_choice=4 AND NOT coalesce((arcade_private.foxey_media_safe_question(q)->>'media_review_pending')::boolean,false)
 THEN RAISE EXCEPTION 'skip_only_for_unapproved_media';END IF;
 was_right:=p_choice<>4 AND p_choice=answer_index;
 r.next_index:=r.next_index+1;
 IF was_right THEN
  r.correct:=r.correct+1;
  r.streak:=r.streak+1;
  r.best_streak:=greatest(r.best_streak,r.streak);
  r.score:=r.score+10+least(r.streak,10)*2;
 ELSIF p_choice<>4 THEN r.lives:=r.lives-1;r.streak:=0;END IF;
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
     'correct_option',CASE WHEN p_choice=4 THEN NULL ELSE answer_index END,
     'media_skipped',p_choice=4);
 INSERT INTO arcade_private.quizoria_survival_events
   (event_id,run_id,user_id,index_at_answer,choice,receipt)
 VALUES(p_event_id,p_run_id,uid,r.next_index-1,p_choice,receipt);
 RETURN receipt;
END;
$function$;

CREATE OR REPLACE FUNCTION public.quizoria_endless_answer(p_run_id uuid, p_event_id uuid, p_choice integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_endless_runs%rowtype;
 previous arcade_private.quizoria_endless_events%rowtype;
 right_answer int;was_right boolean;current_difficulty text;
 selected jsonb;next_q jsonb;seen_next jsonb;next_difficulty text;
 score_increment int;receipt jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 IF p_run_id IS NULL OR p_event_id IS NULL OR p_choice NOT BETWEEN 0 AND 4
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
 IF p_choice=4 AND NOT coalesce((arcade_private.foxey_media_safe_question(r.question)->>'media_review_pending')::boolean,false)
 THEN RAISE EXCEPTION 'skip_only_for_unapproved_media';END IF;
 was_right:=p_choice<>4 AND p_choice=right_answer;
 r.answered:=r.answered+1;
 IF was_right THEN
  r.correct:=r.correct+1;
  r.streak:=r.streak+1;r.best_streak:=greatest(r.best_streak,r.streak);
  r.rating:=least(100,r.rating+CASE current_difficulty WHEN 'easy' THEN 10 WHEN 'medium' THEN 7 ELSE 4 END);
  score_increment:=(CASE current_difficulty WHEN 'easy' THEN 10 WHEN 'medium' THEN 20 ELSE 30 END)
   *(1+least(r.streak/3,4));
  r.score:=r.score+score_increment;
 ELSIF p_choice<>4 THEN
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
  pg_catalog.jsonb_build_object('answered',true,'was_correct',was_right,'correct_option',CASE WHEN p_choice=4 THEN NULL ELSE right_answer END,
  'media_skipped',p_choice=4);
 INSERT INTO arcade_private.quizoria_endless_events(event_id,run_id,user_id,index_at_answer,choice,receipt)
 VALUES(p_event_id,p_run_id,uid,r.answered-1,p_choice,receipt);
 RETURN receipt;
END;
$function$;
REVOKE ALL ON FUNCTION public.quizoria_survival_answer(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_survival_answer(uuid,uuid,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.quizoria_endless_answer(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_endless_answer(uuid,uuid,integer) TO authenticated;

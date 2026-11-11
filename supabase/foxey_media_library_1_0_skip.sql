-- FOXEY Media Library: allow a no-point skip only when a previously saved
-- meme image is now quarantined. Enforces owner and operation idempotency.
CREATE OR REPLACE FUNCTION public.quizoria_meme_answer(p_run_id uuid, p_event_id uuid, p_choice integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_meme_runs%rowtype;
  evt arcade_private.quizoria_meme_events%rowtype;
  q jsonb;correct boolean;reward jsonb;answer_index int;receipt jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
  IF p_run_id IS NULL OR p_event_id IS NULL OR p_choice NOT BETWEEN 0 AND 4 OR p_choice IS NULL
  THEN RAISE EXCEPTION 'invalid_answer';END IF;
  SELECT * INTO r FROM arcade_private.quizoria_meme_runs
    WHERE run_id=p_run_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_yours';END IF;
  SELECT * INTO evt FROM arcade_private.quizoria_meme_events WHERE event_id=p_event_id;
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
  IF p_choice=4 AND arcade_private.foxey_media_approved(q->>'image_key')
  THEN RAISE EXCEPTION 'skip_not_permitted';END IF;
  correct:=p_choice<>4 AND p_choice=answer_index;
  r.next_index:=r.next_index+1;
  IF correct THEN r.correct:=r.correct+1;r.score:=r.score+10;END IF;
  r.finished:=r.next_index=jsonb_array_length(r.questions);
  UPDATE arcade_private.quizoria_meme_runs SET
    next_index=r.next_index,score=r.score,correct=r.correct,
    finished=r.finished,
    finished_at=CASE WHEN r.finished THEN now() ELSE NULL END
  WHERE run_id=r.run_id;
  IF r.finished THEN reward:=arcade_private.quizoria_meme_credit(r.run_id);END IF;
  receipt:=arcade_private.quizoria_meme_view(r) ||
    jsonb_build_object('answered',true,'was_correct',correct,
      'correct_option',CASE WHEN p_choice=4 THEN NULL ELSE answer_index END,
      'media_skipped',p_choice=4);
  INSERT INTO arcade_private.quizoria_meme_events(
    event_id,run_id,user_id,index_at_answer,choice,receipt
  ) VALUES(p_event_id,p_run_id,uid,r.next_index-1,p_choice,receipt);
  RETURN receipt;
END
$function$;
REVOKE ALL ON FUNCTION public.quizoria_meme_answer(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_meme_answer(uuid,uuid,integer) TO authenticated;

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
  'streak',p_run.streak,'best_streak',p_run.best_streak,'rating',p_run.rating,
  'cycles',p_run.cycles,'finished',p_run.finished,'question',public_q,'reward',reward);
END;
$fn$;


REVOKE ALL ON FUNCTION arcade_private.quizoria_endless_view(arcade_private.quizoria_endless_runs) FROM PUBLIC,anon,authenticated;

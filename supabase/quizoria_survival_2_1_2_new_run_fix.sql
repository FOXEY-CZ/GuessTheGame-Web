-- Quizoria Survival 2.1.2 — New means new.
-- This only replaces public.quizoria_survival_begin. Old runs are not
-- deleted, archived, finished, overwritten, or counted twice.
-- Unique(user_id,operation_id) retains retry safety.
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

REVOKE ALL ON FUNCTION public.quizoria_survival_begin(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_survival_begin(text,uuid) TO authenticated;

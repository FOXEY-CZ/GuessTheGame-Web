
-- Private recent-aware picker. Does not alter already-issued game snapshots, daily or friend sets.
CREATE OR REPLACE FUNCTION arcade_private.quizoria_meme_pick_recent(
  p_mode text,p_seed text,p_user uuid
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$
  WITH past AS (
    SELECT questions FROM arcade_private.quizoria_meme_runs
    WHERE user_id=p_user AND mode IN ('classic','easy','medium','hard')
      AND finished AND started_at>now()-interval '30 days'
    ORDER BY started_at DESC LIMIT 2
  ),
  recently_seen AS (
    SELECT DISTINCT q->>'image_key' AS image_key
    FROM past CROSS JOIN LATERAL jsonb_array_elements(past.questions) q
  ),
  ranked AS (
    SELECT image_key,
      row_number() OVER(ORDER BY
        CASE WHEN image_key IN (SELECT image_key FROM recently_seen) THEN 1 ELSE 0 END,
        md5(p_seed||':image:'||image_key)) AS ord
    FROM (SELECT DISTINCT image_key FROM arcade_private.quizoria_meme_questions) source
  ),
  picked AS (
    SELECT b.ord,q.*
    FROM ranked b
    JOIN arcade_private.quizoria_meme_questions q ON q.image_key=b.image_key
    WHERE b.ord<=10 AND q.difficulty=CASE
      WHEN p_mode IN ('easy','medium','hard') THEN p_mode
      WHEN b.ord<=4 THEN 'easy'
      WHEN b.ord<=8 THEN 'medium'
      ELSE 'hard' END
  )
  SELECT jsonb_agg(jsonb_build_object(
    'id',id,'image_key',image_key,'difficulty',difficulty,
    'prompt_cs',prompt_cs,'prompt_en',prompt_en,'options',options,
    'answer_index',answer_index,'image_url',image_url,
    'source_url',source_url,'author',author,'license',license
  ) ORDER BY ord) FROM picked
$$;
REVOKE ALL ON FUNCTION arcade_private.quizoria_meme_pick_recent(text,text,uuid)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.quizoria_meme_begin(
  p_mode text,p_operation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_meme_runs%rowtype;
  qs jsonb;seed text;v_count int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
  IF p_operation IS NULL OR p_mode NOT IN ('classic','easy','medium','hard','daily')
    OR p_mode IS NULL THEN RAISE EXCEPTION 'invalid_mode';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended(uid::text,20261113));
  SELECT * INTO r FROM arcade_private.quizoria_meme_runs
    WHERE user_id=uid AND operation_id=p_operation;
  IF FOUND THEN
    IF r.mode<>p_mode THEN RAISE EXCEPTION 'operation_conflict';END IF;
    RETURN arcade_private.quizoria_meme_view(r);
  END IF;
  -- Daily quiz is the same question list globally (UTC) and one run per player.
  IF p_mode='daily' THEN
    SELECT * INTO r FROM arcade_private.quizoria_meme_runs
      WHERE user_id=uid AND mode='daily'
      AND (started_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
    IF FOUND THEN RETURN arcade_private.quizoria_meme_view(r);END IF;
  END IF;
  SELECT * INTO r FROM arcade_private.quizoria_meme_runs
    WHERE user_id=uid AND mode=p_mode AND finished=false AND expires_at>now()
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN arcade_private.quizoria_meme_view(r);END IF;
  SELECT count(*) INTO v_count FROM arcade_private.quizoria_meme_runs
    WHERE user_id=uid AND started_at>now()-interval '1 hour';
  IF v_count>=16 THEN RAISE EXCEPTION 'rate_limited';END IF;
  seed:=CASE WHEN p_mode='daily' THEN
    'quizoria-meme-daily-v1:'||(now() AT TIME ZONE 'UTC')::date::text
    ELSE 'quizoria-meme-v1:'||p_operation::text END;
  qs:=CASE WHEN p_mode='daily'
    THEN arcade_private.quizoria_meme_pick(p_mode,seed)
    ELSE arcade_private.quizoria_meme_pick_recent(p_mode,seed,uid) END;
  IF qs IS NULL OR jsonb_array_length(qs)<>(CASE WHEN p_mode='daily' THEN 5 ELSE 10 END)
  THEN RAISE EXCEPTION 'meme_question_bank_incomplete';END IF;
  INSERT INTO arcade_private.quizoria_meme_runs(
    user_id,operation_id,mode,questions
  ) VALUES(uid,p_operation,p_mode,qs) RETURNING * INTO r;
  RETURN arcade_private.quizoria_meme_view(r);
END
$$;
REVOKE ALL ON FUNCTION public.quizoria_meme_begin(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_meme_begin(text,uuid) TO authenticated;


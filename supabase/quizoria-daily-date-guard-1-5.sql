-- Quizoria 1.5: Daily quizzes never resume a prior UTC date.
-- Previously saved unfinished runs remain accessible through their direct resume IDs.
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
    AND (p_mode<>'daily' OR (started_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
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

CREATE OR REPLACE FUNCTION public.quizoria_movie_begin(
  p_mode text,p_operation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_movie_runs%rowtype;
  qs jsonb;seed text;v_count int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
  IF p_operation IS NULL OR p_mode NOT IN ('classic','easy','medium','hard','films','series','daily')
    OR p_mode IS NULL THEN RAISE EXCEPTION 'invalid_mode';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended(uid::text,20261118));
  SELECT * INTO r FROM arcade_private.quizoria_movie_runs
    WHERE user_id=uid AND operation_id=p_operation;
  IF FOUND THEN
    IF r.mode<>p_mode THEN RAISE EXCEPTION 'operation_conflict';END IF;
    RETURN arcade_private.quizoria_movie_view(r);
  END IF;
  -- Daily quiz is the same question list globally (UTC) and one run per player.
  IF p_mode='daily' THEN
    SELECT * INTO r FROM arcade_private.quizoria_movie_runs
      WHERE user_id=uid AND mode='daily'
      AND (started_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
    IF FOUND THEN RETURN arcade_private.quizoria_movie_view(r);END IF;
  END IF;
  SELECT * INTO r FROM arcade_private.quizoria_movie_runs
    WHERE user_id=uid AND mode=p_mode AND finished=false AND expires_at>now()
    AND (p_mode<>'daily' OR (started_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN arcade_private.quizoria_movie_view(r);END IF;
  SELECT count(*) INTO v_count FROM arcade_private.quizoria_movie_runs
    WHERE user_id=uid AND started_at>now()-interval '1 hour';
  IF v_count>=16 THEN RAISE EXCEPTION 'rate_limited';END IF;
  seed:=CASE WHEN p_mode='daily' THEN
    'quizoria-movie-daily-v1:'||(now() AT TIME ZONE 'UTC')::date::text
    ELSE 'quizoria-movie-v1:'||p_operation::text END;
  qs:=arcade_private.quizoria_movie_pick(p_mode,seed);
  IF qs IS NULL OR jsonb_array_length(qs)<>(CASE WHEN p_mode='daily' THEN 5 ELSE 10 END)
  THEN RAISE EXCEPTION 'movie_question_bank_incomplete';END IF;
  INSERT INTO arcade_private.quizoria_movie_runs(
    user_id,operation_id,mode,questions
  ) VALUES(uid,p_operation,p_mode,qs) RETURNING * INTO r;
  RETURN arcade_private.quizoria_movie_view(r);
END
$$;

CREATE OR REPLACE FUNCTION public.quizoria_music_begin(
  p_mode text,p_operation uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid();r arcade_private.quizoria_music_runs%rowtype;
  qs jsonb;seed text;v_count int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
  IF p_operation IS NULL OR p_mode NOT IN ('classic','easy','medium','hard','czsk','world','daily')
    OR p_mode IS NULL THEN RAISE EXCEPTION 'invalid_mode';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(hashtextextended(uid::text,20261126));
  SELECT * INTO r FROM arcade_private.quizoria_music_runs
    WHERE user_id=uid AND operation_id=p_operation;
  IF FOUND THEN
    IF r.mode<>p_mode THEN RAISE EXCEPTION 'operation_conflict';END IF;
    RETURN arcade_private.quizoria_music_view(r);
  END IF;
  -- Daily quiz is the same question list globally (UTC) and one run per player.
  IF p_mode='daily' THEN
    SELECT * INTO r FROM arcade_private.quizoria_music_runs
      WHERE user_id=uid AND mode='daily'
      AND (started_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
    IF FOUND THEN RETURN arcade_private.quizoria_music_view(r);END IF;
  END IF;
  SELECT * INTO r FROM arcade_private.quizoria_music_runs
    WHERE user_id=uid AND mode=p_mode AND finished=false AND expires_at>now()
    AND (p_mode<>'daily' OR (started_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)
      ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN arcade_private.quizoria_music_view(r);END IF;
  SELECT count(*) INTO v_count FROM arcade_private.quizoria_music_runs
    WHERE user_id=uid AND started_at>now()-interval '1 hour';
  IF v_count>=16 THEN RAISE EXCEPTION 'rate_limited';END IF;
  seed:=CASE WHEN p_mode='daily' THEN
    'quizoria-music-daily-v1:'||(now() AT TIME ZONE 'UTC')::date::text
    ELSE 'quizoria-music-v1:'||p_operation::text END;
  qs:=arcade_private.quizoria_music_pick(p_mode,seed);
  IF qs IS NULL OR jsonb_array_length(qs)<>(CASE WHEN p_mode='daily' THEN 5 ELSE 10 END)
  THEN RAISE EXCEPTION 'movie_question_bank_incomplete';END IF;
  INSERT INTO arcade_private.quizoria_music_runs(
    user_id,operation_id,mode,questions
  ) VALUES(uid,p_operation,p_mode,qs) RETURNING * INTO r;
  RETURN arcade_private.quizoria_music_view(r);
END
$$;

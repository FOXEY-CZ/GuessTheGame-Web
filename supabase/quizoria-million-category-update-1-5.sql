-- Quizoria 1.5: safe Million Challenge category selection. Existing video-game runs remain unchanged.
ALTER TABLE arcade_private.quizoria_million_runs
  DROP CONSTRAINT IF EXISTS quizoria_million_runs_category_id_check;
ALTER TABLE arcade_private.quizoria_million_runs
  ADD CONSTRAINT quizoria_million_runs_category_id_check
  CHECK(category_id IN ('video-games','memes','movies','music'));

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
    'category',p_run.category_id,'stage',p_run.next_index,
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
        'options',q->'options','option_labels',q->'option_labels',
        'visual',q->>'visual','image_url',q->>'image_url',
        'source_url',q->>'source_url','clue_cs',q->>'clue_cs',
        'clue_en',q->>'clue_en',
        'hidden',p_run.current_hidden,'audience',p_run.audience
      ) END,
    'reward',reward
  );
END;
$$;
REVOKE ALL ON FUNCTION arcade_private.quizoria_million_view(arcade_private.quizoria_million_runs)
  FROM PUBLIC,anon,authenticated;

-- Internal payout is deliberately isolated from legacy 10-question reward receipts.

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
    WHERE user_id=uid AND category_id='video-games' AND status='active' AND expires_at>now()
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
      coalesce(v4.wrong,v3.wrong,v2.wrong,q.wrong) AS wrong,
      coalesce(v4.cs,v3.cs,v2.cs,t.cs) AS cs,
      coalesce(v4.en,v3.en,v2.en,t.en) AS en
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
  IF pg_catalog.jsonb_array_length(coalesce(v_questions,'[]'::jsonb))<>15
    OR pg_catalog.jsonb_array_length(coalesce(v_reserves,'[]'::jsonb))<>3
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


CREATE OR REPLACE FUNCTION public.quizoria_million_begin_category(
 p_operation uuid,p_category text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 uid uuid:=auth.uid();
 r arcade_private.quizoria_million_runs%rowtype;
 selected jsonb;reserves jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 IF p_operation IS NULL OR p_category IS NULL
    OR p_category NOT IN ('video-games','memes','movies','music')
 THEN RAISE EXCEPTION 'invalid_category';END IF;
 IF p_category='video-games' THEN
   RETURN public.quizoria_million_begin(p_operation);
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,20261110));
 SELECT * INTO r FROM arcade_private.quizoria_million_runs
   WHERE user_id=uid AND operation_id=p_operation FOR UPDATE;
 IF FOUND THEN
   IF r.category_id<>p_category THEN RAISE EXCEPTION 'operation_category_conflict';END IF;
   RETURN arcade_private.quizoria_million_view(r);
 END IF;
 SELECT * INTO r FROM arcade_private.quizoria_million_runs
   WHERE user_id=uid AND category_id=p_category AND status='active'
     AND expires_at>now()
   ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN RETURN arcade_private.quizoria_million_view(r);END IF;
 IF (SELECT count(*) FROM arcade_private.quizoria_million_runs
     WHERE user_id=uid AND started_at>now()-interval '1 hour')>=4
    OR (SELECT count(*) FROM arcade_private.quizoria_million_runs
     WHERE user_id=uid AND (started_at AT TIME ZONE 'UTC')::date=(now() AT TIME ZONE 'UTC')::date)>=8
 THEN RAISE EXCEPTION 'quizoria_play_limit';END IF;
 WITH bank AS (
   SELECT 'memes' AS category,q.image_key AS topic_key,q.difficulty,
     q.prompt_cs,q.prompt_en,q.options,q.answer_index,
     NULL::text AS visual,NULL::text AS clue_cs,NULL::text AS clue_en,
     q.image_url,q.source_url
   FROM arcade_private.quizoria_meme_questions q WHERE p_category='memes'
   UNION ALL
   SELECT 'movies',q.topic_key,q.difficulty,
     q.prompt_cs,q.prompt_en,q.options,q.answer_index,
     q.visual,q.clue_cs,q.clue_en,NULL::text,q.source_url
   FROM arcade_private.quizoria_movie_questions q WHERE p_category='movies'
   UNION ALL
   SELECT 'music',q.topic_key,q.difficulty,
     q.prompt_cs,q.prompt_en,q.options,q.answer_index,
     q.visual,q.clue_cs,q.clue_en,NULL::text,q.source_url
   FROM arcade_private.quizoria_music_questions q WHERE p_category='music'
 ), ranked AS (
   SELECT topic_key,row_number() OVER (
     ORDER BY md5(p_operation::text||':'||p_category||':'||topic_key)
   ) AS pos
   FROM (SELECT DISTINCT topic_key FROM bank) unique_topics
 ), chosen AS (
   SELECT b.*,ranked.pos,((ranked.pos-1)%6)+1 AS tier_pos
   FROM ranked
   JOIN bank b ON b.topic_key=ranked.topic_key AND b.difficulty=
     CASE WHEN ranked.pos<=6 THEN 'easy'
          WHEN ranked.pos<=12 THEN 'medium' ELSE 'hard' END
   WHERE ranked.pos<=18
 ), converted AS (
   SELECT pos,tier_pos,
     jsonb_build_object(
       'cs',prompt_cs,'en',prompt_en,'difficulty',difficulty,
       'options',jsonb_build_array('A','B','C','D'),
       'option_labels',options,
       'answer',chr(65+answer_index),
       'visual',visual,'clue_cs',clue_cs,'clue_en',clue_en,
       'image_url',image_url,'source_url',source_url
     ) AS question
   FROM chosen
   WHERE jsonb_array_length(options)=4 AND answer_index BETWEEN 0 AND 3
 )
 SELECT
   jsonb_agg(question ORDER BY pos) FILTER(WHERE tier_pos<=5),
   jsonb_agg(question ORDER BY pos) FILTER(WHERE tier_pos=6)
 INTO selected,reserves
 FROM converted;
 IF jsonb_array_length(coalesce(selected,'[]'::jsonb))<>15
   OR jsonb_array_length(coalesce(reserves,'[]'::jsonb))<>3
 THEN RAISE EXCEPTION 'quizoria_question_bank_incomplete';END IF;
 INSERT INTO arcade_private.quizoria_million_runs(
   user_id,operation_id,category_id,questions,reserves
 ) VALUES(uid,p_operation,p_category,selected,reserves)
 RETURNING * INTO r;
 RETURN arcade_private.quizoria_million_view(r);
END;
$$;
REVOKE ALL ON FUNCTION public.quizoria_million_begin_category(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_million_begin_category(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.quizoria_million_state_category(
 p_category text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE uid uuid:=auth.uid(); r arcade_private.quizoria_million_runs%rowtype;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 IF p_category NOT IN ('video-games','memes','movies','music') OR p_category IS NULL
 THEN RAISE EXCEPTION 'invalid_category';END IF;
 SELECT * INTO r FROM arcade_private.quizoria_million_runs
 WHERE user_id=uid AND category_id=p_category
 ORDER BY CASE WHEN status='active' AND expires_at>now() THEN 0 ELSE 1 END,
 started_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'has_run',false,'category',p_category);END IF;
 RETURN arcade_private.quizoria_million_view(r);
END;
$$;
REVOKE ALL ON FUNCTION public.quizoria_million_state_category(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_million_state_category(text) TO authenticated;

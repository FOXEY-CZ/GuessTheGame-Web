-- Quizoria 1.6: add General Knowledge as fifth selectable category in Million Challenge.
-- No alterations to existing video-game, meme, movie or music challenge snapshots.
ALTER TABLE arcade_private.quizoria_million_runs
 DROP CONSTRAINT IF EXISTS quizoria_million_runs_category_id_check;
ALTER TABLE arcade_private.quizoria_million_runs
 ADD CONSTRAINT quizoria_million_runs_category_id_check
 CHECK(category_id IN ('video-games','memes','movies','music','general'));

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
    OR p_category NOT IN ('video-games','memes','movies','music','general')
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
   UNION ALL
   SELECT 'general',q.topic_key,q.difficulty,
     q.prompt_cs,q.prompt_en,q.options,q.answer_index,
     q.visual,q.clue_cs,q.clue_en,NULL::text,q.source_url
   FROM arcade_private.quizoria_general_questions q WHERE p_category='general'
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
 IF p_category NOT IN ('video-games','memes','movies','music','general') OR p_category IS NULL
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

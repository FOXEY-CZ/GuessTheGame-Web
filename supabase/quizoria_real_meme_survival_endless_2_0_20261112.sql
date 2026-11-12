-- FOXEY Arcade · Real Meme Survival and Endless pools (2026-11-12).
-- 36 primary meme questions + 24 separately saved meme bonus questions = 60.
-- No tech trivia, former VQ illustrations or emoji-only stand-ins in meme modes.
-- Rewards, member accounts and previously created runs are untouched.
BEGIN;
CREATE OR REPLACE FUNCTION arcade_private.quizoria_survival_pick(p_category text, p_operation uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH all_questions AS (
 SELECT 'video-games'::text category,q.id,q.difficulty,
  pg_catalog.jsonb_build_object(
   'category','video-games','difficulty',q.difficulty,
   'prompt_cs',t.cs,'prompt_en',t.en,
   'clue_cs',coalesce(t.clues_cs[1],''),'clue_en',coalesce(t.clues_en[1],''),
   'visual',null,'media_type','text','source_url',null,
   'author',null,'license',null
  ) || arcade_private.quizoria_survival_video_options(q.answer,q.wrong,q.id,p_operation::text) payload
 FROM arcade_private.quiz_questions q
 JOIN arcade_private.quiz_question_texts t ON t.id=q.id
 WHERE q.pool='secure' AND pg_catalog.array_length(q.wrong,1)>=3
 UNION ALL
 SELECT 'memes',m.id,m.difficulty,pg_catalog.jsonb_build_object(
  'category','memes','difficulty',m.difficulty,
  'prompt_cs',m.prompt_cs,'prompt_en',m.prompt_en,
  'clue_cs','','clue_en','','visual',m.image_url,
  'media_type','image','source_url',m.source_url,'author',m.author,'license',m.license,
  'options',m.options,'answer_index',m.answer_index)
 FROM arcade_private.quizoria_meme_questions m
 WHERE arcade_private.foxey_media_approved(m.image_key)
   AND EXISTS (
     SELECT 1 FROM arcade_private.foxey_media_assets a
     WHERE a.asset_key=m.image_key AND a.asset_url=m.image_url
       AND a.status='approved' AND a.commercial_use AND a.redistribution_allowed
       AND a.asset_url ~ '^https://foxey-cz[.]github[.]io/GuessTheGame-Web/quizoria/media/commons/meme-[a-z0-9-]+[.](jpg|png)$'
   )
 UNION ALL
 SELECT 'memes',m.id,m.difficulty,pg_catalog.jsonb_build_object(
  'category','memes','difficulty',m.difficulty,
  'prompt_cs',m.prompt_cs,'prompt_en',m.prompt_en,
  'clue_cs','','clue_en','','visual',m.image_url,
  'media_type','image','source_url',m.source_url,'author',m.author,'license',m.license,
  'options',m.options,'answer_index',m.answer_index)
 FROM arcade_private.quizoria_meme_bonus_questions m
 WHERE arcade_private.foxey_media_approved(m.image_key)
   AND EXISTS (
     SELECT 1 FROM arcade_private.foxey_media_assets a
     WHERE a.asset_key=m.image_key AND a.asset_url=m.image_url
       AND a.status='approved' AND a.commercial_use AND a.redistribution_allowed
       AND a.asset_url ~ '^https://foxey-cz[.]github[.]io/GuessTheGame-Web/quizoria/media/commons/meme-[a-z0-9-]+[.](jpg|png)$'
   )
 UNION ALL
 SELECT 'movies',m.id,m.difficulty,pg_catalog.jsonb_build_object(
  'category','movies','difficulty',m.difficulty,
  'prompt_cs',m.prompt_cs,'prompt_en',m.prompt_en,
  'clue_cs',m.clue_cs,'clue_en',m.clue_en,'visual',m.visual,
  'media_type',m.media_type,'source_url',m.source_url,'author',m.author,'license',m.license,
  'options',m.options,'answer_index',m.answer_index)
 FROM arcade_private.quizoria_movie_questions m
 UNION ALL
 SELECT 'music',m.id,m.difficulty,pg_catalog.jsonb_build_object(
  'category','music','difficulty',m.difficulty,
  'prompt_cs',m.prompt_cs,'prompt_en',m.prompt_en,
  'clue_cs',m.clue_cs,'clue_en',m.clue_en,'visual',m.visual,
  'media_type',m.media_type,'source_url',m.source_url,'author',m.author,'license',m.license,
  'options',m.options,'answer_index',m.answer_index)
 FROM arcade_private.quizoria_music_questions m
 UNION ALL
 SELECT 'general',m.id,m.difficulty,pg_catalog.jsonb_build_object(
  'category','general','difficulty',m.difficulty,
  'prompt_cs',m.prompt_cs,'prompt_en',m.prompt_en,
  'clue_cs',m.clue_cs,'clue_en',m.clue_en,'visual',m.visual,
  'media_type',m.media_type,'source_url',m.source_url,'author',m.author,'license',m.license,
  'options',m.options,'answer_index',m.answer_index)
 FROM arcade_private.quizoria_general_questions m
), per_category AS (
 SELECT a.*,
  pg_catalog.row_number() OVER(
    PARTITION BY category,difficulty
    ORDER BY pg_catalog.md5(p_operation::text||':'||id)
  ) local_rank
 FROM all_questions a
 WHERE p_category='mix' OR category=p_category
), ordered AS (
 SELECT p.*,
  pg_catalog.row_number() OVER(
   PARTITION BY difficulty
   ORDER BY local_rank,pg_catalog.md5(p_operation::text||':'||category||':'||id)
  ) slot
 FROM per_category p
)
SELECT coalesce(pg_catalog.jsonb_agg(payload ORDER BY
 CASE difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,slot),'[]'::jsonb)
FROM ordered WHERE difficulty IN ('easy','medium','hard') AND slot<=20;
$function$

CREATE OR REPLACE FUNCTION arcade_private.quizoria_endless_pool(p_category text, p_difficulty text, p_seed text)
 RETURNS TABLE(question_key text, payload jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
 WHERE arcade_private.foxey_media_approved(m.image_key)
   AND EXISTS (
     SELECT 1 FROM arcade_private.foxey_media_assets a
     WHERE a.asset_key=m.image_key AND a.asset_url=m.image_url
       AND a.status='approved' AND a.commercial_use AND a.redistribution_allowed
       AND a.asset_url ~ '^https://foxey-cz[.]github[.]io/GuessTheGame-Web/quizoria/media/commons/meme-[a-z0-9-]+[.](jpg|png)$'
   )
 UNION ALL
 SELECT 'memes',m.id,m.difficulty,pg_catalog.jsonb_build_object(
  'category','memes','difficulty',m.difficulty,'prompt_cs',m.prompt_cs,'prompt_en',m.prompt_en,
  'clue_cs','','clue_en','','visual',m.image_url,'media_type','image',
  'source_url',m.source_url,'author',m.author,'license',m.license,
  'options',m.options,'answer_index',m.answer_index)
 FROM arcade_private.quizoria_meme_bonus_questions m
 WHERE arcade_private.foxey_media_approved(m.image_key)
   AND EXISTS (
     SELECT 1 FROM arcade_private.foxey_media_assets a
     WHERE a.asset_key=m.image_key AND a.asset_url=m.image_url
       AND a.status='approved' AND a.commercial_use AND a.redistribution_allowed
       AND a.asset_url ~ '^https://foxey-cz[.]github[.]io/GuessTheGame-Web/quizoria/media/commons/meme-[a-z0-9-]+[.](jpg|png)$'
   )
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
$function$

REVOKE ALL ON FUNCTION arcade_private.quizoria_survival_pick(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.quizoria_endless_pool(text,text,text) FROM PUBLIC,anon,authenticated;
COMMIT;

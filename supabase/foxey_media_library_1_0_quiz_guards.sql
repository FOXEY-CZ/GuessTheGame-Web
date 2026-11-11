-- FOXEY Arcade Media Library 1.0: enforce media rights in ALL meme play paths.
-- Read-only gates: no saves, balances, run histories, correct answers or payouts modified.
-- Existing saved questions remain intact but unapproved image URLs are redacted in views.
-- New meme runs/challenges draw exclusively from approved media.
CREATE OR REPLACE FUNCTION arcade_private.quizoria_meme_pick(p_mode text, p_seed text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  WITH ranked_images AS (
    SELECT image_key,
      row_number() OVER (ORDER BY md5(p_seed||':image:'||image_key)) AS position
    FROM (SELECT DISTINCT image_key FROM arcade_private.quizoria_meme_questions
      WHERE arcade_private.foxey_media_approved(image_key)) a
  ), selected AS (
    SELECT position,q.*
    FROM ranked_images im
    JOIN arcade_private.quizoria_meme_questions q ON q.image_key=im.image_key
    WHERE im.position <= CASE WHEN p_mode='daily' THEN 5 ELSE 10 END
    AND q.difficulty=CASE
      WHEN p_mode IN ('easy','medium','hard') THEN p_mode
      WHEN im.position <= CASE WHEN p_mode='daily' THEN 2 ELSE 4 END THEN 'easy'
      WHEN im.position <= CASE WHEN p_mode='daily' THEN 4 ELSE 8 END THEN 'medium'
      ELSE 'hard' END
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',id,'image_key',image_key,'difficulty',difficulty,
      'prompt_cs',prompt_cs,'prompt_en',prompt_en,
      'options',options,'answer_index',answer_index,
      'image_url',image_url,'source_url',source_url,
      'author',author,'license',license
    ) ORDER BY position)
  FROM selected
$function$;


CREATE OR REPLACE FUNCTION arcade_private.quizoria_meme_pick_recent(p_mode text, p_seed text, p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
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
    FROM (SELECT DISTINCT image_key FROM arcade_private.quizoria_meme_questions
     WHERE arcade_private.foxey_media_approved(image_key)) source
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
$function$;


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
$function$;


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
$function$;


CREATE OR REPLACE FUNCTION arcade_private.quizoria_meme_view(p_run arcade_private.quizoria_meme_runs)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE q jsonb; reward jsonb; expired boolean;
BEGIN
  expired:=p_run.expires_at<=now() AND p_run.finished IS DISTINCT FROM true;
  IF p_run.finished IS DISTINCT FROM true AND NOT expired
    AND p_run.next_index<jsonb_array_length(p_run.questions)
  THEN q:=p_run.questions->p_run.next_index;
  END IF;
  SELECT jsonb_build_object(
    'xp',xp,'crowns',crowns,'shards',shards,'reason',reason
  ) INTO reward FROM arcade_private.quizoria_meme_rewards WHERE run_id=p_run.run_id;
  RETURN jsonb_build_object(
    'ok',true,'has_run',true,'run_id',p_run.run_id,
    'mode',p_run.mode,'stage',p_run.next_index,'total',jsonb_array_length(p_run.questions),
    'score',p_run.score,'correct',p_run.correct,
    'finished',p_run.finished,'expired',expired,
    'challenge_id',p_run.challenge_id,'expires_at',p_run.expires_at,
    'question',CASE WHEN q IS NULL THEN NULL ELSE arcade_private.foxey_media_safe_question(jsonb_build_object(
      'image_key',q->>'image_key','prompt_cs',q->>'prompt_cs','prompt_en',q->>'prompt_en',
      'image_url',q->>'image_url','source_url',q->>'source_url',
      'author',q->>'author','license',q->>'license',
      'difficulty',q->>'difficulty',
      'options',q->'options'
    )) END,
    'reward',reward
  );
END
$function$;


CREATE OR REPLACE FUNCTION arcade_private.quizoria_survival_view(p_run arcade_private.quizoria_survival_runs)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE q jsonb; reward jsonb; expired boolean;
BEGIN
 expired:=p_run.expires_at<=now() AND NOT p_run.finished;
 IF NOT p_run.finished AND NOT expired AND p_run.next_index<60 THEN
  q:=p_run.questions->p_run.next_index;
 END IF;
 SELECT pg_catalog.jsonb_build_object('xp',xp,'crowns',crowns,'shards',shards,'reason',reason)
  INTO reward FROM arcade_private.quizoria_survival_rewards WHERE run_id=p_run.run_id;
 RETURN pg_catalog.jsonb_build_object(
  'ok',true,'has_run',true,'run_id',p_run.run_id,
  'category',p_run.category,'stage',p_run.next_index,'total',60,
  'score',p_run.score,'correct',p_run.correct,'lives',p_run.lives,
  'streak',p_run.streak,'best_streak',p_run.best_streak,
  'finished',p_run.finished,'expired',expired,'expires_at',p_run.expires_at,
  'reward',reward,
  'question',CASE WHEN q IS NULL THEN NULL ELSE arcade_private.foxey_media_safe_question(pg_catalog.jsonb_build_object(
    'category',q->>'category','difficulty',q->>'difficulty',
    'prompt_cs',q->>'prompt_cs','prompt_en',q->>'prompt_en',
    'clue_cs',q->>'clue_cs','clue_en',q->>'clue_en',
    'visual',q->>'visual','media_type',q->>'media_type',
    'source_url',q->>'source_url','author',q->>'author','license',q->>'license',
    'options',q->'options'
  )) END
 );
END;
$function$;


CREATE OR REPLACE FUNCTION arcade_private.quizoria_endless_view(p_run arcade_private.quizoria_endless_runs)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE reward jsonb; public_q jsonb;
BEGIN
 SELECT pg_catalog.jsonb_build_object('xp',xp,'crowns',crowns,'reason',reason)
 INTO reward FROM arcade_private.quizoria_endless_rewards WHERE run_id=p_run.run_id;
 IF NOT p_run.finished THEN
  -- Strip private question_key and correct answer BEFORE returning the RPC.
  public_q:=arcade_private.foxey_media_safe_question(
      p_run.question - 'answer_index' - 'question_key');
 END IF;
 RETURN pg_catalog.jsonb_build_object(
  'ok',true,'has_run',true,'run_id',p_run.run_id,'category',p_run.category,
  'stage',p_run.answered,'correct',p_run.correct,'score',p_run.score,
  'streak',p_run.streak,'multiplier',1+least(p_run.streak/3,4),
  'best_streak',p_run.best_streak,'rating',p_run.rating,
  'cycles',p_run.cycles,'finished',p_run.finished,'question',public_q,'reward',reward);
END;
$function$;

REVOKE ALL ON FUNCTION arcade_private.quizoria_meme_pick(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.quizoria_meme_pick_recent(text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.quizoria_survival_pick(text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.quizoria_endless_pool(text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.quizoria_meme_view(arcade_private.quizoria_meme_runs) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.quizoria_survival_view(arcade_private.quizoria_survival_runs) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.quizoria_endless_view(arcade_private.quizoria_endless_runs) FROM PUBLIC,anon,authenticated;

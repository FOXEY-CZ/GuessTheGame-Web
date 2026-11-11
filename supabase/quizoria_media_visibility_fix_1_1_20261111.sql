-- FOXEY Arcade Media Visibility Fix 1.1 · 2026-11-11
-- New Meme rounds: first-party audited SVG art only; preserve historical runs.
-- Future solo saves can replace only unanswered images via authenticated repair RPC.
BEGIN;
CREATE OR REPLACE FUNCTION arcade_private.quizoria_meme_pick(p_mode text, p_seed text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  WITH ranked_images AS (
    SELECT image_key,
      row_number() OVER (ORDER BY md5(p_seed||':image:'||image_key)) AS position
    FROM (SELECT DISTINCT q.image_key FROM arcade_private.quizoria_meme_questions q
      JOIN arcade_private.foxey_media_assets a ON a.asset_key=q.image_key
      WHERE arcade_private.foxey_media_approved(q.image_key)
        AND q.image_key LIKE 'vq-%'
        AND q.image_url=a.asset_url
        AND a.asset_url ~ '^https://foxey-cz\.github\.io/GuessTheGame-Web/quizoria/media/vq-[a-z0-9-]+\.svg$') a
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
    FROM (SELECT DISTINCT q.image_key FROM arcade_private.quizoria_meme_questions q
     JOIN arcade_private.foxey_media_assets a ON a.asset_key=q.image_key
     WHERE arcade_private.foxey_media_approved(q.image_key)
       AND q.image_key LIKE 'vq-%'
       AND q.image_url=a.asset_url
       AND a.asset_url ~ '^https://foxey-cz\.github\.io/GuessTheGame-Web/quizoria/media/vq-[a-z0-9-]+\.svg$') source
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



-- A reversible, owner-scoped repair for *unanswered* questions in SOLO saves.
-- Already answered questions, scores, rewards, challenge parity and daily seeded runs stay unchanged.
-- A subsequent call is idempotent. This RPC does not spend currency or grant score.
CREATE OR REPLACE FUNCTION public.quizoria_meme_repair_media(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  uid uuid:=auth.uid();
  r arcade_private.quizoria_meme_runs%rowtype;
  i int;
  old_q jsonb;
  replacement jsonb;
  replaced int:=0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_run_id IS NULL THEN RAISE EXCEPTION 'invalid_run_id'; END IF;
  SELECT * INTO r FROM arcade_private.quizoria_meme_runs
    WHERE run_id=p_run_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_yours'; END IF;
  IF r.finished OR r.expires_at<=now() OR r.challenge_id IS NOT NULL
      OR r.mode NOT IN ('classic','easy','medium','hard') THEN
    RETURN arcade_private.quizoria_meme_view(r) ||
      pg_catalog.jsonb_build_object('media_repaired',0,'repair_supported',false);
  END IF;
  FOR i IN r.next_index..pg_catalog.jsonb_array_length(r.questions)-1 LOOP
    old_q:=r.questions->i;
    -- Keep only verifiably approved first-party illustrations in unplayed solo slots.
    IF EXISTS (
      SELECT 1 FROM arcade_private.foxey_media_assets a
      WHERE a.asset_key=old_q->>'image_key'
        AND a.status='approved' AND a.commercial_use AND a.redistribution_allowed
        AND a.asset_url=old_q->>'image_url'
        AND a.asset_url ~ '^https://foxey-cz\.github\.io/GuessTheGame-Web/quizoria/media/vq-[a-z0-9-]+\.svg$'
    ) THEN CONTINUE; END IF;
    replacement:=NULL;
    SELECT pg_catalog.to_jsonb(q)-'created_at' INTO replacement
    FROM arcade_private.quizoria_meme_questions q
    JOIN arcade_private.foxey_media_assets a ON a.asset_key=q.image_key
    WHERE q.difficulty=old_q->>'difficulty'
      AND q.image_key LIKE 'vq-%'
      AND a.status='approved' AND a.commercial_use AND a.redistribution_allowed
      AND q.image_url=a.asset_url
      AND a.asset_url ~ '^https://foxey-cz\.github\.io/GuessTheGame-Web/quizoria/media/vq-[a-z0-9-]+\.svg$'
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_array_elements(r.questions) entry
        WHERE entry->>'image_key'=q.image_key
      )
    ORDER BY pg_catalog.md5(r.run_id::text||':'||i::text||':'||q.image_key)
    LIMIT 1;
    IF replacement IS NULL THEN
      RAISE EXCEPTION 'media_repair_pool_incomplete'; -- transaction fails closed
    END IF;
    r.questions:=pg_catalog.jsonb_set(r.questions,ARRAY[i::text],replacement,false);
    replaced:=replaced+1;
  END LOOP;
  IF replaced>0 THEN
    UPDATE arcade_private.quizoria_meme_runs
       SET questions=r.questions
     WHERE run_id=r.run_id AND user_id=uid;
  END IF;
  RETURN arcade_private.quizoria_meme_view(r) ||
    pg_catalog.jsonb_build_object('media_repaired',replaced,'repair_supported',true);
END
$function$;
REVOKE ALL ON FUNCTION public.quizoria_meme_repair_media(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_meme_repair_media(uuid) TO authenticated;



COMMIT;

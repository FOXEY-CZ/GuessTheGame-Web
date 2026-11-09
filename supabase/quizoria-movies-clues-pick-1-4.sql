-- Quizoria 1.4: add original textual hints and balance cinema/TV selection.
-- Does not modify saved runs, wallets, profiles or previous quiz functions.
ALTER TABLE arcade_private.quizoria_movie_questions
  ADD COLUMN IF NOT EXISTS clue_cs text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS clue_en text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION arcade_private.quizoria_movie_pick(
  p_mode text,p_seed text
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$
  WITH topics AS (
    SELECT DISTINCT topic_key,media_type
    FROM arcade_private.quizoria_movie_questions
    WHERE (p_mode<>'films' OR media_type='film')
      AND (p_mode<>'series' OR media_type='series')
  ), ranked AS (
    SELECT topic_key,media_type,
      row_number() OVER (
        PARTITION BY media_type ORDER BY md5(p_seed||':topic:'||topic_key)
      ) AS group_pos
    FROM topics
  ), eligible AS (
    SELECT topic_key,media_type FROM ranked
    WHERE CASE
      WHEN p_mode='daily' AND media_type='film' THEN group_pos<=3
      WHEN p_mode='daily' AND media_type='series' THEN group_pos<=2
      WHEN p_mode IN ('films','series') THEN group_pos<=10
      ELSE group_pos<=5
    END
  ), positions AS (
    SELECT *,row_number() OVER (
      ORDER BY md5(p_seed||':order:'||topic_key)
    ) AS position FROM eligible
  ), selected AS (
    SELECT t.position,q.*
    FROM positions t
    JOIN arcade_private.quizoria_movie_questions q ON q.topic_key=t.topic_key
    WHERE q.difficulty=CASE
      WHEN p_mode IN ('easy','medium','hard') THEN p_mode
      WHEN t.position<=CASE WHEN p_mode='daily' THEN 2 ELSE 4 END THEN 'easy'
      WHEN t.position<=CASE WHEN p_mode='daily' THEN 4 ELSE 8 END THEN 'medium'
      ELSE 'hard' END
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',id,'topic_key',topic_key,'media_type',media_type,
      'difficulty',difficulty,
      'prompt_cs',prompt_cs,'prompt_en',prompt_en,
      'clue_cs',clue_cs,'clue_en',clue_en,
      'options',options,'answer_index',answer_index,
      'visual',visual,'source_url',source_url,
      'author',author,'license',license
    ) ORDER BY position
  ) FROM selected
$$;
REVOKE ALL ON FUNCTION arcade_private.quizoria_movie_pick(text,text)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION arcade_private.quizoria_movie_view(
  p_run arcade_private.quizoria_movie_runs
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $$
DECLARE q jsonb; reward jsonb; expired boolean;
BEGIN
  expired:=p_run.expires_at<=now() AND p_run.finished IS DISTINCT FROM true;
  IF p_run.finished IS DISTINCT FROM true AND NOT expired
    AND p_run.next_index<jsonb_array_length(p_run.questions)
  THEN q:=p_run.questions->p_run.next_index;
  END IF;
  SELECT jsonb_build_object(
    'xp',xp,'crowns',crowns,'shards',shards,'reason',reason
  ) INTO reward FROM arcade_private.quizoria_movie_rewards WHERE run_id=p_run.run_id;
  RETURN jsonb_build_object(
    'ok',true,'has_run',true,'run_id',p_run.run_id,
    'mode',p_run.mode,'stage',p_run.next_index,'total',jsonb_array_length(p_run.questions),
    'score',p_run.score,'correct',p_run.correct,
    'finished',p_run.finished,'expired',expired,
    'challenge_id',p_run.challenge_id,'expires_at',p_run.expires_at,
    'question',CASE WHEN q IS NULL THEN NULL ELSE jsonb_build_object(
      'prompt_cs',q->>'prompt_cs','prompt_en',q->>'prompt_en',
      'clue_cs',q->>'clue_cs','clue_en',q->>'clue_en',
      'visual',q->>'visual','source_url',q->>'source_url',
      'author',q->>'author','license',q->>'license',
      'difficulty',q->>'difficulty','media_type',q->>'media_type',
      'options',q->'options'
    ) END,
    'reward',reward
  );
END
$$;
REVOKE ALL ON FUNCTION arcade_private.quizoria_movie_view(arcade_private.quizoria_movie_runs)
  FROM PUBLIC,anon,authenticated;


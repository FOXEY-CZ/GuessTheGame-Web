-- Hotfix 2.1.1: resolve the PL/pgSQL column-vs-variable collision
-- in quizoria_survival_lobby. Additive CREATE OR REPLACE, no data changes.
-- Preserves original SECURITY DEFINER, ownership checks and RPC grants.
CREATE OR REPLACE FUNCTION public.quizoria_survival_lobby(p_category text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE uid uuid:=auth.uid();active arcade_private.quizoria_survival_runs%rowtype;
 history jsonb;leaders jsonb;best_score int:=0;best_stage int:=0;v_best_streak int:=0;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 IF p_category IS NULL OR
  p_category NOT IN ('video-games','memes','movies','music','general','mix')
 THEN RAISE EXCEPTION 'invalid_category';END IF;
 SELECT * INTO active FROM arcade_private.quizoria_survival_runs
  WHERE user_id=uid AND category=p_category AND NOT finished AND expires_at>now()
  ORDER BY started_at DESC LIMIT 1;
 SELECT coalesce(max(r.score),0),coalesce(max(r.next_index),0),coalesce(max(r.best_streak),0)
 INTO best_score,best_stage,v_best_streak
 FROM arcade_private.quizoria_survival_runs AS r
 WHERE r.user_id=uid AND r.category=p_category;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'run_id',run_id,'category',category,'stage',next_index,'score',score,
  'correct',correct,'lives',lives,'finished',finished,'expires_at',expires_at,
  'started_at',started_at) ORDER BY started_at DESC),'[]'::jsonb)
 INTO history FROM (
  SELECT run_id,category,next_index,score,correct,lives,finished,expires_at,started_at
  FROM arcade_private.quizoria_survival_runs WHERE user_id=uid AND category=p_category
  ORDER BY started_at DESC LIMIT 10
 ) recent;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
   'nickname',nickname,'score',score,'stage',stage,'category',p_category)
   ORDER BY score DESC,stage DESC),'[]'::jsonb)
 INTO leaders FROM (
  SELECT coalesce(nullif(p.nickname,''),'Hráč') nickname,
     max(r.score) score,max(r.next_index) stage
  FROM arcade_private.quizoria_survival_runs r
  JOIN public.arcade_profiles p ON p.user_id=r.user_id
  WHERE r.category=p_category AND r.finished=true
  GROUP BY r.user_id,p.nickname ORDER BY score DESC,stage DESC LIMIT 10
 ) leaderboard;
 RETURN pg_catalog.jsonb_build_object('ok',true,'category',p_category,
  'active',CASE WHEN active.run_id IS NULL THEN null
     ELSE arcade_private.quizoria_survival_view(active) END,
  'best',pg_catalog.jsonb_build_object('score',best_score,'stage',best_stage,'streak',v_best_streak),
  'runs',history,'leaderboard',leaders);
END;
$fn$;

-- Preserve secure access: only signed-in players may invoke this public RPC.
REVOKE ALL ON FUNCTION public.quizoria_survival_lobby(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_survival_lobby(text) TO authenticated;

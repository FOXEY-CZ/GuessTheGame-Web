-- Quizoria Endless 2.2.1 leaderboard consistency hotfix.
-- Select the highest-scoring VERIFIED FINISHED run per player, with its
-- own stage and streak rather than independent maxima across runs.
CREATE OR REPLACE FUNCTION public.quizoria_endless_lobby(p_category text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE uid uuid:=auth.uid();active arcade_private.quizoria_endless_runs%rowtype;
 records jsonb;leaderboard jsonb;best_score bigint:=0;best_stage int:=0;best_streak_value int:=0;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 IF p_category NOT IN ('video-games','memes','movies','music','general','mix')
 THEN RAISE EXCEPTION 'invalid_category';END IF;
 SELECT * INTO active FROM arcade_private.quizoria_endless_runs r
 WHERE r.user_id=uid AND r.category=p_category AND NOT r.finished
 ORDER BY r.started_at DESC LIMIT 1;
 SELECT coalesce(max(r.score),0),coalesce(max(r.answered),0),coalesce(max(r.best_streak),0)
 INTO best_score,best_stage,best_streak_value FROM arcade_private.quizoria_endless_runs r
 WHERE r.user_id=uid AND r.category=p_category;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'run_id',x.run_id,'stage',x.answered,'score',x.score,'correct',x.correct,
  'streak',x.streak,'rating',x.rating,'finished',x.finished,
  'started_at',x.started_at) ORDER BY x.started_at DESC),'[]'::jsonb)
 INTO records
 FROM(SELECT run_id,answered,score,correct,streak,rating,finished,started_at
  FROM arcade_private.quizoria_endless_runs WHERE user_id=uid AND category=p_category
  ORDER BY started_at DESC LIMIT 12)x;
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'nickname',l.nickname,'score',l.score,'stage',l.stage,'streak',l.streak)
  ORDER BY l.score DESC,l.stage DESC),'[]'::jsonb)
 INTO leaderboard
 FROM(
  SELECT coalesce(nullif(p.nickname,''),'Hráč') nickname,
   r.score AS score,r.answered AS stage,r.best_streak AS streak
  FROM (
   SELECT DISTINCT ON (user_id) user_id,score,answered,best_streak
   FROM arcade_private.quizoria_endless_runs
   WHERE category=p_category AND finished
   ORDER BY user_id,score DESC,answered DESC,started_at DESC
  ) r
  JOIN public.arcade_profiles p ON p.user_id=r.user_id
  ORDER BY r.score DESC,r.answered DESC LIMIT 10
 )l;
 RETURN pg_catalog.jsonb_build_object('ok',true,'category',p_category,
  'active',CASE WHEN active.run_id IS NULL THEN NULL ELSE arcade_private.quizoria_endless_view(active) END,
  'best',pg_catalog.jsonb_build_object('score',best_score,'stage',best_stage,'streak',best_streak_value),
  'runs',records,'leaderboard',leaderboard);
END;
$fn$;
REVOKE ALL ON FUNCTION public.quizoria_endless_lobby(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_endless_lobby(text) TO authenticated;

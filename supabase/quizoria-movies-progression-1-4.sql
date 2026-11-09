-- Existing global achievements remain unchanged. New quiz badges reuse verified wallet ledger.
ALTER TABLE arcade_private.quizoria_milestone_catalog
  DROP CONSTRAINT IF EXISTS quizoria_milestone_catalog_category_check;
ALTER TABLE arcade_private.quizoria_milestone_catalog
  ADD CONSTRAINT quizoria_milestone_catalog_category_check
  CHECK(category IN ('video_games','memes','million','movies'));
INSERT INTO arcade_private.quizoria_milestone_catalog
(code,category,icon,name_cs,name_en,description_cs,description_en,metric,target,
 reward_xp,reward_crowns,reward_shards,display_order)
VALUES
 ('movie_first','movies','🎬','První klapka','First Take',
  'Dokonči první kvíz z filmů a seriálů.','Finish your first Movies & Series quiz.',
  'movie_games',1,6,1,0,90),
 ('movie_10','movies','🍿','Filmový nadšenec','Film Buff',
  'Dokonči deset filmových a seriálových kvízů.','Finish ten Movies & Series quizzes.',
  'movie_games',10,16,2,0,100),
 ('movie_perfect','movies','⭐','Režisér znalostí','Trivia Director',
  'Dokonči filmový nebo seriálový kvíz bez chyby.','Finish a film or TV quiz with no mistakes.',
  'movie_perfect',1,20,2,0,110),
 ('series_fan','movies','📺','Seriálový maratonec','TV Marathoner',
  'Dokonči pět kvízů v režimu Jen seriály.','Complete five Series Only quizzes.',
  'movie_series',5,12,1,0,120)
ON CONFLICT(code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.quizoria_progress()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 uid uuid:=auth.uid();
 vg_games bigint:=0;vg_correct bigint:=0;vg_answered bigint:=0;
 vg_perfect bigint:=0;vg_best bigint:=0;
 meme_games bigint:=0;meme_correct bigint:=0;meme_answered bigint:=0;
 meme_perfect bigint:=0;meme_daily bigint:=0;meme_best bigint:=0;
 movie_games bigint:=0;movie_correct bigint:=0;movie_answered bigint:=0;
 movie_perfect bigint:=0;movie_films bigint:=0;movie_series bigint:=0;movie_best bigint:=0;
 mill_games bigint:=0;mill_wins bigint:=0;mill_checkpoint bigint:=0;
 mill_best bigint:=0;mill_highest bigint:=0;
 badges jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated';END IF;
 SELECT count(*),coalesce(sum((r.result->>'correct')::bigint),0),
        coalesce(sum(jsonb_array_length(r.submission)),0),
        count(*) FILTER (WHERE r.result->>'perfect'='true'),
        coalesce(max((r.result->>'score')::bigint),0)
 INTO vg_games,vg_correct,vg_answered,vg_perfect,vg_best
 FROM arcade_private.quiz_runs r
 WHERE r.user_id=uid AND r.server_issued=true AND r.question_version>=4
   AND r.submitted_at IS NOT NULL
   AND jsonb_typeof(r.submission)='array'
   AND (r.result->>'correct') IS NOT NULL;
 SELECT count(*) FILTER (WHERE finished),
        coalesce(sum(correct) FILTER (WHERE finished),0),
        coalesce(sum(next_index) FILTER (WHERE finished),0),
        count(*) FILTER (WHERE finished AND correct=jsonb_array_length(questions)),
        count(*) FILTER (WHERE finished AND mode='daily'),
        coalesce(max(score) FILTER (WHERE finished),0)
 INTO meme_games,meme_correct,meme_answered,meme_perfect,meme_daily,meme_best
 FROM arcade_private.quizoria_meme_runs WHERE user_id=uid;
 SELECT count(*) FILTER(WHERE finished),
        coalesce(sum(correct) FILTER(WHERE finished),0),
        coalesce(sum(next_index) FILTER(WHERE finished),0),
        count(*) FILTER(WHERE finished AND correct=jsonb_array_length(questions)),
        count(*) FILTER(WHERE finished AND mode='films'),
        count(*) FILTER(WHERE finished AND mode='series'),
        coalesce(max(score) FILTER(WHERE finished),0)
 INTO movie_games,movie_correct,movie_answered,movie_perfect,movie_films,movie_series,movie_best
 FROM arcade_private.quizoria_movie_runs WHERE user_id=uid;
 SELECT count(*) FILTER(WHERE status IN ('won','lost','cashed')),
        count(*) FILTER(WHERE status='won'),
        count(*) FILTER(WHERE next_index>=5),
        coalesce(max(payout),0),
        coalesce(max(next_index),0)
 INTO mill_games,mill_wins,mill_checkpoint,mill_best,mill_highest
 FROM arcade_private.quizoria_million_runs WHERE user_id=uid;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
    'code',d.code,'category',d.category,'icon',d.icon,
    'name_cs',d.name_cs,'name_en',d.name_en,
    'description_cs',d.description_cs,'description_en',d.description_en,
    'metric',d.metric,'target',d.target,
    'progress',LEAST(d.target,CASE d.metric
      WHEN 'meme_games' THEN meme_games
      WHEN 'meme_perfect' THEN meme_perfect
      WHEN 'meme_daily' THEN meme_daily
      WHEN 'game_games' THEN vg_games
      WHEN 'game_perfect' THEN vg_perfect
      WHEN 'million_checkpoint' THEN mill_checkpoint
      WHEN 'million_wins' THEN mill_wins
      WHEN 'movie_games' THEN movie_games
      WHEN 'movie_perfect' THEN movie_perfect
      WHEN 'movie_films' THEN movie_films
      WHEN 'movie_series' THEN movie_series
      ELSE 0 END),
    'claimed',c.claim_id IS NOT NULL,
    'reward_xp',d.reward_xp,'reward_crowns',d.reward_crowns,
    'reward_shards',d.reward_shards
   ) ORDER BY d.display_order),'[]'::jsonb)
 INTO badges
 FROM arcade_private.quizoria_milestone_catalog d
 LEFT JOIN arcade_private.quizoria_milestone_claims c
   ON c.user_id=uid AND c.code=d.code;
 RETURN jsonb_build_object('ok',true,
   'categories',jsonb_build_object(
      'video_games',jsonb_build_object(
       'games',vg_games,'correct',vg_correct,'answered',vg_answered,
       'perfect',vg_perfect,'best',vg_best,
       'skill_level',1+(vg_correct/10)),
      'memes',jsonb_build_object(
       'games',meme_games,'correct',meme_correct,'answered',meme_answered,
       'perfect',meme_perfect,'daily',meme_daily,'best',meme_best,
       'skill_level',1+(meme_correct/10)),
      'movies',jsonb_build_object(
       'games',movie_games,'correct',movie_correct,'answered',movie_answered,
       'perfect',movie_perfect,'films',movie_films,'series',movie_series,
       'best',movie_best,'skill_level',1+(movie_correct/10)),
      'million',jsonb_build_object(
       'games',mill_games,'wins',mill_wins,'checkpoint',mill_checkpoint,
       'best',mill_best,'highest_stage',mill_highest,
       'skill_level',1+(mill_highest/5))
   ),'milestones',badges
 );
END;
$$;

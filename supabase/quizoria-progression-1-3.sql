-- Quizoria 1.3: per-category progress and one-time category badges.
-- Existing global Arcade achievements, reward receipts and game saves remain unchanged.
-- Rewards are collectible only for authenticated users using verified server stats.
CREATE TABLE IF NOT EXISTS arcade_private.quizoria_milestone_catalog (
  code text PRIMARY KEY,
  category text NOT NULL CHECK(category IN ('video_games','memes','million')),
  icon text NOT NULL,
  name_cs text NOT NULL,
  name_en text NOT NULL,
  description_cs text NOT NULL,
  description_en text NOT NULL,
  metric text NOT NULL,
  target integer NOT NULL CHECK(target>0),
  reward_xp integer NOT NULL CHECK(reward_xp>=0),
  reward_crowns integer NOT NULL CHECK(reward_crowns>=0),
  reward_shards integer NOT NULL CHECK(reward_shards>=0),
  display_order integer NOT NULL UNIQUE
);
ALTER TABLE arcade_private.quizoria_milestone_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_milestone_catalog FROM PUBLIC,anon,authenticated;

INSERT INTO arcade_private.quizoria_milestone_catalog
 (code,category,icon,name_cs,name_en,description_cs,description_en,metric,target,reward_xp,reward_crowns,reward_shards,display_order)
VALUES
 ('meme_first','memes','😂','První mem','First Meme','Dokonči první meme kvíz.','Finish your first meme quiz.','meme_games',1,5,1,0,10),
 ('meme_10','memes','🧩','Internetový znalec','Internet Connoisseur','Dokonči 10 meme kvízů.','Finish 10 meme quizzes.','meme_games',10,15,2,0,20),
 ('meme_perfect','memes','🏆','Meme mistr','Meme Master','Dokonči meme kvíz bez jediné chyby.','Finish a meme quiz without a wrong answer.','meme_perfect',1,18,2,0,30),
 ('meme_daily_3','memes','📅','Denní dávka','Daily Dose','Dokonči tři denní meme kvízy.','Finish three daily meme quizzes.','meme_daily',3,12,1,0,40),
 ('games_10','video_games','🎮','Herní veterán','Gaming Veteran','Dokonči deset zabezpečených videoherních kvízů.','Finish ten verified video-game quizzes.','game_games',10,12,2,0,50),
 ('games_perfect','video_games','🎯','Neporazitelný hráč','Flawless Gamer','Dokonči videoherní kvíz bez chyby.','Finish a video-game quiz perfectly.','game_perfect',1,10,1,0,60),
 ('million_checkpoint','million','💰','První jistota','First Checkpoint','Dosáhni páté otázky v Milionové výzvě.','Reach the first checkpoint in Million Challenge.','million_checkpoint',1,14,2,0,70),
 ('million_champion','million','👑','Milionový šampion','Million Champion','Vyhraj Milionovou výzvu.','Win a Million Challenge.','million_wins',1,45,4,1,80)
ON CONFLICT(code) DO NOTHING;

CREATE TABLE IF NOT EXISTS arcade_private.quizoria_milestone_claims(
  claim_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL REFERENCES arcade_private.quizoria_milestone_catalog(code),
  xp integer NOT NULL CHECK(xp>=0),
  crowns integer NOT NULL CHECK(crowns>=0),
  shards integer NOT NULL CHECK(shards>=0),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,code)
);
ALTER TABLE arcade_private.quizoria_milestone_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.quizoria_milestone_claims FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS quizoria_milestone_claims_user
  ON arcade_private.quizoria_milestone_claims(user_id,claimed_at DESC);

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
      'million',jsonb_build_object(
       'games',mill_games,'wins',mill_wins,'checkpoint',mill_checkpoint,
       'best',mill_best,'highest_stage',mill_highest,
       'skill_level',1+(mill_highest/5))
   ),'milestones',badges
 );
END;
$$;
REVOKE ALL ON FUNCTION public.quizoria_progress() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_progress() TO authenticated;

CREATE OR REPLACE FUNCTION public.quizoria_claim_milestone(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 uid uuid:=auth.uid();
 d arcade_private.quizoria_milestone_catalog%rowtype;
 previous arcade_private.quizoria_milestone_claims%rowtype;
 wallet public.arcade_wallets%rowtype;
 enabled_mode arcade_private.quiz_reward_modes%rowtype;
 progress_data jsonb; badge jsonb; claim_id uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 IF p_code IS NULL OR pg_catalog.length(p_code)>64 THEN
   RAISE EXCEPTION 'invalid_milestone';END IF;
 SELECT * INTO d FROM arcade_private.quizoria_milestone_catalog WHERE code=p_code;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid_milestone';END IF;
 INSERT INTO public.arcade_wallets(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
 SELECT * INTO wallet FROM public.arcade_wallets WHERE user_id=uid FOR UPDATE;
 SELECT * INTO previous FROM arcade_private.quizoria_milestone_claims
 WHERE user_id=uid AND code=p_code;
 IF FOUND THEN
   RETURN jsonb_build_object('ok',true,'already_claimed',true,
     'xp',previous.xp,'crowns',previous.crowns,'shards',previous.shards);
 END IF;
 progress_data:=public.quizoria_progress();
 SELECT x INTO badge
 FROM jsonb_array_elements(progress_data->'milestones') x
 WHERE x->>'code'=p_code;
 IF badge IS NULL OR (badge->>'progress')::integer<d.target THEN
    RAISE EXCEPTION 'milestone_not_ready';END IF;
 SELECT * INTO enabled_mode FROM arcade_private.quiz_reward_modes
 WHERE user_id=uid FOR UPDATE;
 IF enabled_mode.user_id IS NULL OR enabled_mode.enabled IS DISTINCT FROM true
    OR NOT EXISTS(SELECT 1 FROM arcade_private.quiz_reward_activation_audit audit
         WHERE audit.user_id=uid AND audit.activated_at=enabled_mode.activated_at)
    OR NOT EXISTS(SELECT 1 FROM arcade_private.quiz_payout_release_gate gate
         WHERE gate.gate_name='verified_rewards' AND gate.enabled)
 THEN RAISE EXCEPTION 'verified_rewards_not_active';END IF;
 IF wallet.crowns+d.reward_crowns>1000000000 OR
    wallet.shards+d.reward_shards>1000000000
 THEN RAISE EXCEPTION 'wallet_limit';END IF;
 INSERT INTO arcade_private.quizoria_milestone_claims
  (user_id,code,xp,crowns,shards)
 VALUES(uid,d.code,d.reward_xp,d.reward_crowns,d.reward_shards)
 RETURNING arcade_private.quizoria_milestone_claims.claim_id INTO claim_id;
 INSERT INTO public.arcade_profiles(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
 UPDATE public.arcade_profiles SET arcade_xp=arcade_xp+d.reward_xp,
   updated_at=now() WHERE user_id=uid;
 UPDATE public.arcade_wallets
   SET crowns=crowns+d.reward_crowns, shards=shards+d.reward_shards,
       updated_at=now() WHERE user_id=uid;
 UPDATE arcade_private.quiz_reward_modes
   SET verified_xp=verified_xp+d.reward_xp,updated_at=now()
   WHERE user_id=uid;
 INSERT INTO public.arcade_wallet_events(operation_id,user_id,kind,details)
 VALUES(claim_id,uid,'achievement_reward',
   jsonb_build_object('source','quizoria-milestones-1-3','code',d.code,
     'xp',d.reward_xp,'crowns',d.reward_crowns,'shards',d.reward_shards));
 RETURN jsonb_build_object('ok',true,'already_claimed',false,
   'code',d.code,'xp',d.reward_xp,
   'crowns',d.reward_crowns,'shards',d.reward_shards);
END;
$$;
REVOKE ALL ON FUNCTION public.quizoria_claim_milestone(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quizoria_claim_milestone(text) TO authenticated;

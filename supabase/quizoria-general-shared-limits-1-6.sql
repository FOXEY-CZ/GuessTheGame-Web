-- Quizoria 1.6: include verified General Knowledge payouts in the existing
-- hourly/daily global earning caps for all older secure Quizoria categories.
-- Only function bodies change; wallets, savestates, users and receipts are untouched.
DO $patch$
DECLARE
 name text;
 def text;
 needle text:='(SELECT count(*) FROM arcade_private.quiz_reward_receipts';
 general_hour text:='(SELECT count(*) FROM arcade_private.quizoria_general_rewards WHERE user_id=uid AND xp>0 AND created_at>now()-interval ''1 hour'')' || E'\n      +';
 general_day text:='(SELECT count(*) FROM arcade_private.quizoria_general_rewards WHERE user_id=uid AND xp>0 AND (created_at AT TIME ZONE ''UTC'')::date=(now() AT TIME ZONE ''UTC'')::date)' || E'\n      +';
BEGIN
 FOREACH name IN ARRAY ARRAY['quizoria_meme_credit','quizoria_movie_credit','quizoria_music_credit','quizoria_million_credit'] LOOP
   SELECT pg_get_functiondef(p.oid) INTO def
   FROM pg_proc p WHERE p.pronamespace='arcade_private'::regnamespace
     AND p.proname=name AND pg_get_function_identity_arguments(p.oid)='p_run_id uuid';
   IF def IS NULL THEN RAISE EXCEPTION 'Missing payout function %',name;END IF;
   IF position('FROM arcade_private.quizoria_general_rewards' IN def)>0 THEN
     CONTINUE;
   END IF;
   IF (length(def)-length(replace(def,needle,'')))<>2*length(needle) THEN
     RAISE EXCEPTION 'Unexpected hourly/daily receipt-count structure: %',name;
   END IF;
   def:=split_part(def,needle,1)||general_hour||needle||
     split_part(def,needle,2)||general_day||needle||split_part(def,needle,3);
   EXECUTE def;
 END LOOP;
END
$patch$;

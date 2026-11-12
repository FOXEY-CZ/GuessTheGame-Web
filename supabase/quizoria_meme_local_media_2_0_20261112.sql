-- FOXEY Arcade · Local Meme Media 2.0 · 2026-11-12
-- Redirect approved Wikimedia files to immutable project-hosted copies.
-- Source/authorship/licenses retained. No wallet or saved games are altered.
BEGIN;
WITH inputs AS (
 SELECT * FROM jsonb_to_recordset('[{"key":"doge","url":"https://foxey-cz.github.io/GuessTheGame-Web/quizoria/media/commons/meme-doge.jpg","src":"https://commons.wikimedia.org/wiki/File:Doge_meme_example.jpg"},{"key":"burger","url":"https://foxey-cz.github.io/GuessTheGame-Web/quizoria/media/commons/meme-lolcat-cheezburger.jpg","src":"https://commons.wikimedia.org/wiki/File:I_can_has_cheezburger.jpg"},{"key":"crying","url":"https://foxey-cz.github.io/GuessTheGame-Web/quizoria/media/commons/meme-crying-cat.jpg","src":"https://commons.wikimedia.org/wiki/File:Cat_crying_(Lolcat).jpg"},{"key":"floppa","url":"https://foxey-cz.github.io/GuessTheGame-Web/quizoria/media/commons/meme-big-floppa.jpg","src":"https://commons.wikimedia.org/wiki/File:Big_Floppa.jpg"},{"key":"honest","url":"https://foxey-cz.github.io/GuessTheGame-Web/quizoria/media/commons/meme-honest-work.jpg","src":"https://commons.wikimedia.org/wiki/File:Ohio_farmer_David_Brandt.jpg"},{"key":"q23meme-touch-grass","url":"https://foxey-cz.github.io/GuessTheGame-Web/quizoria/media/commons/meme-touch-grass.jpg","src":"https://commons.wikimedia.org/wiki/File:Touch_grass.jpg"},{"key":"gerrit","url":"https://foxey-cz.github.io/GuessTheGame-Web/quizoria/media/commons/meme-keyboard-cat.jpg","src":"https://commons.wikimedia.org/wiki/File:Cat_keyboard_gerrit.jpg"},{"key":"serious","url":"https://foxey-cz.github.io/GuessTheGame-Web/quizoria/media/commons/meme-lolcat-example.jpg","src":"https://commons.wikimedia.org/wiki/File:CatLolCatExample.jpg"},{"key":"qm13-beastcat","url":"https://foxey-cz.github.io/GuessTheGame-Web/quizoria/media/commons/meme-beast-cat.jpg","src":"https://commons.wikimedia.org/wiki/File:Beast_Cat_Original_(Meme).jpg"},{"key":"qm13-meerkat2024","url":"https://foxey-cz.github.io/GuessTheGame-Web/quizoria/media/commons/meme-meerkat.jpg","src":"https://commons.wikimedia.org/wiki/File:Meerkat_meme.jpg"},{"key":"q23meme-keyboard-sleep","url":"https://foxey-cz.github.io/GuessTheGame-Web/quizoria/media/commons/meme-sleepy-keyboard-cat.jpg","src":"https://commons.wikimedia.org/wiki/File:Cat_Sleeping_on_Keyboard.jpg"},{"key":"rickqr","url":"https://foxey-cz.github.io/GuessTheGame-Web/quizoria/media/commons/meme-rickroll-qr.png","src":"https://commons.wikimedia.org/wiki/File:RickRoll_QR_Code.png"}]'::jsonb)
 AS t(key text,url text,src text)
)
UPDATE arcade_private.foxey_media_assets a
SET asset_url=inputs.url,
 changes_note=coalesce(nullif(a.changes_note,''),'') || ' · Stored verified Wikimedia Commons resized copy locally for reliable mobile display; source retained.',
 updated_at=now()
FROM inputs WHERE a.asset_key=inputs.key AND a.source_url=inputs.src
 AND a.status='approved' AND a.commercial_use AND a.redistribution_allowed
 AND inputs.url ~ '^https://foxey-cz[.]github[.]io/GuessTheGame-Web/quizoria/media/commons/meme-[a-z0-9-]+[.](jpg|png)$';

-- IMPORTANT: saved questions remain unchanged. Only the PUBLIC VIEW replaces
-- their broken Wikimedia hotlink with the exact rights-approved local URL.
CREATE OR REPLACE FUNCTION arcade_private.foxey_media_safe_question(p_q jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
 v_key text;v_url text;v_asset arcade_private.foxey_media_assets%rowtype;
BEGIN
 IF p_q IS NULL THEN RETURN NULL; END IF;
 IF NOT (p_q ? 'image_key') AND NOT (p_q ? 'image_url') AND
   coalesce(p_q->>'category','')<>'memes'
 THEN RETURN p_q; END IF;
 v_key:=p_q->>'image_key';
 v_url:=coalesce(p_q->>'image_url',p_q->>'visual');
 IF v_key IS NOT NULL THEN
   SELECT * INTO v_asset FROM arcade_private.foxey_media_assets WHERE asset_key=v_key;
 ELSE
   SELECT * INTO v_asset FROM arcade_private.foxey_media_assets a
   WHERE a.asset_url=v_url OR
    (p_q->>'source_url' IS NOT NULL AND a.source_url=p_q->>'source_url')
   ORDER BY CASE WHEN a.asset_url=v_url THEN 0 ELSE 1 END
   LIMIT 1;
 END IF;
 IF FOUND AND v_asset.status='approved' AND v_asset.commercial_use
  AND v_asset.redistribution_allowed THEN
  RETURN p_q || pg_catalog.jsonb_build_object(
    'source_url',v_asset.source_url,'author',v_asset.author,
    'license',v_asset.license_name,'license_url',v_asset.license_url,
    'media_review_pending',false
  ) || (CASE WHEN p_q ? 'image_url' THEN
       pg_catalog.jsonb_build_object('image_url',v_asset.asset_url)
       ELSE '{}'::jsonb END)
    || (CASE WHEN p_q ? 'visual' AND coalesce(p_q->>'category','memes')='memes'
       THEN pg_catalog.jsonb_build_object('visual',v_asset.asset_url)
       ELSE '{}'::jsonb END);
 END IF;
 RETURN p_q || pg_catalog.jsonb_build_object(
   'image_url','emoji:🔒','visual','🔒','source_url',null,
   'author',null,'license',null,'license_url',null,'media_review_pending',true);
END;
$function$;
REVOKE ALL ON FUNCTION arcade_private.foxey_media_safe_question(jsonb) FROM PUBLIC,anon,authenticated;
COMMIT;

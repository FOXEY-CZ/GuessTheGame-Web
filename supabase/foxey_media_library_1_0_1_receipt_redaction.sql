-- Media Library 1.0.1: redact even in old cached answer receipts.
-- Legacy meme receipts omit image_key but still include image_url.
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
 -- Other quiz categories do not have image questions in this library.
 IF NOT (p_q ? 'image_key') AND NOT (p_q ? 'image_url')
    AND coalesce(p_q->>'category','')<>'memes'
 THEN RETURN p_q; END IF;
 v_key:=p_q->>'image_key';
 v_url:=coalesce(p_q->>'image_url',p_q->>'visual');
 IF v_key IS NOT NULL THEN
   SELECT * INTO v_asset FROM arcade_private.foxey_media_assets WHERE asset_key=v_key;
 ELSE
   SELECT * INTO v_asset FROM arcade_private.foxey_media_assets WHERE asset_url=v_url LIMIT 1;
 END IF;
 IF FOUND AND v_asset.status='approved' AND v_asset.commercial_use AND v_asset.redistribution_allowed THEN
  RETURN p_q || pg_catalog.jsonb_build_object(
    'source_url',v_asset.source_url,'author',v_asset.author,
    'license',v_asset.license_name,'license_url',v_asset.license_url,
    'media_review_pending',false);
 END IF;
 RETURN p_q || pg_catalog.jsonb_build_object(
  'image_url','emoji:🔒','visual','🔒',
  'source_url',null,'author',null,'license',null,'license_url',null,
  'media_review_pending',true);
END;
$function$;
CREATE OR REPLACE FUNCTION arcade_private.foxey_media_safe_receipt(p_receipt jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=''
AS $fn$
 SELECT CASE
   WHEN p_receipt IS NULL THEN NULL
   WHEN pg_catalog.jsonb_typeof(p_receipt->'question')='object'
     THEN pg_catalog.jsonb_set(p_receipt,'{question}',
       arcade_private.foxey_media_safe_question(p_receipt->'question'),true)
   ELSE p_receipt END;
$fn$;
REVOKE ALL ON FUNCTION arcade_private.foxey_media_safe_question(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.foxey_media_safe_receipt(jsonb) FROM PUBLIC,anon,authenticated;

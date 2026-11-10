-- FOXEY Arcade Media Library 1.0
-- Internal, review-gated catalogue of copyrighted / open-licensed assets.
-- No player data, game state, rewards, or existing questions are changed.
CREATE TABLE IF NOT EXISTS arcade_private.foxey_media_assets (
  asset_key text PRIMARY KEY,
  collection text NOT NULL DEFAULT 'quizoria-memes',
  asset_type text NOT NULL CHECK(asset_type IN('image','emoji','audio','video')),
  asset_url text NOT NULL,
  title text NOT NULL DEFAULT '',
  source_url text NOT NULL,
  author text NOT NULL,
  license_name text NOT NULL,
  license_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'review'
    CHECK(status IN('approved','review','blocked')),
  commercial_use boolean NOT NULL DEFAULT false,
  redistribution_allowed boolean NOT NULL DEFAULT false,
  derivatives_allowed boolean NOT NULL DEFAULT false,
  share_alike boolean NOT NULL DEFAULT false,
  attribution_required boolean NOT NULL DEFAULT true,
  changes_note text NOT NULL DEFAULT 'Displayed without creative modification; scaled responsively.',
  review_notes text NOT NULL DEFAULT '',
  evidence_source text NOT NULL DEFAULT '',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT foxey_media_approval_evidence CHECK(
    status<>'approved' OR (
      commercial_use AND redistribution_allowed AND verified_at IS NOT NULL
      AND length(trim(author))>0 AND length(trim(source_url))>0
      AND length(trim(license_name))>0 AND length(trim(license_url))>0
      AND length(trim(evidence_source))>0
    )
  )
);
CREATE INDEX IF NOT EXISTS foxey_media_asset_status_idx
  ON arcade_private.foxey_media_assets(collection,status);
CREATE UNIQUE INDEX IF NOT EXISTS foxey_media_url_unique_idx
  ON arcade_private.foxey_media_assets(asset_url)
  WHERE asset_type='image';
ALTER TABLE arcade_private.foxey_media_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.foxey_media_assets FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS arcade_private.foxey_media_audit_log(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_key text NOT NULL REFERENCES arcade_private.foxey_media_assets(asset_key),
  previous_status text,
  next_status text NOT NULL,
  reviewer_note text NOT NULL DEFAULT '',
  evidence_source text NOT NULL DEFAULT '',
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE arcade_private.foxey_media_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arcade_private.foxey_media_audit_log FROM PUBLIC,anon,authenticated;

-- Stable private approval predicate, fail-closed for unknown assets.
CREATE OR REPLACE FUNCTION arcade_private.foxey_media_approved(p_asset_key text)
RETURNS boolean LANGUAGE sql STABLE SET search_path=''
AS $fn$
  SELECT EXISTS (
   SELECT 1 FROM arcade_private.foxey_media_assets m
   WHERE m.asset_key=p_asset_key
     AND m.status='approved'
     AND m.commercial_use AND m.redistribution_allowed
  )
$fn$;

-- Redact previously saved image URLs that were later quarantined.
-- Never destroy the saved question/score; only the rendered media reference.
CREATE OR REPLACE FUNCTION arcade_private.foxey_media_safe_question(p_q jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=''
AS $fn$
DECLARE
  v_key text;v_url text;v_asset arcade_private.foxey_media_assets%rowtype;
BEGIN
 IF p_q IS NULL THEN RETURN NULL; END IF;
 -- Other quiz categories do not have image questions in this library.
 IF NOT (p_q ? 'image_key')
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
$fn$;

-- Public attribution register contains approved/redistributable metadata only.
-- It is deliberately read-only and does not expose quiz answer keys.
CREATE OR REPLACE FUNCTION public.foxey_media_credits()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'asset_key',asset_key,'collection',collection,'type',asset_type,
  'title',title,'author',author,'license',license_name,
  'license_url',license_url,'source_url',source_url,
  'changes',changes_note,'verified_at',verified_at)
  ORDER BY collection,asset_key),'[]'::jsonb)
 FROM arcade_private.foxey_media_assets
 WHERE status='approved' AND commercial_use AND redistribution_allowed;
$fn$;
REVOKE ALL ON FUNCTION public.foxey_media_credits() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.foxey_media_credits() TO anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.foxey_media_approved(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION arcade_private.foxey_media_safe_question(jsonb) FROM PUBLIC,anon,authenticated;

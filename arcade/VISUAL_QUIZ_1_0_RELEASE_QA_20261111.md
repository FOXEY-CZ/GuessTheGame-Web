# FOXEY Arcade · Quizoria Visual Quiz 1.0
**Release date:** 2026-11-11 · **Scope:** new original visuals and server-owned internet/meme questions.

## Product changes

- Added **13 self-authored, self-contained SVG illustrations** to `quizoria/media/vq-*.svg`.
- Every scene has an original title and illustration (no copied protected meme template, celebrity face, third-party image, or external SVG dependency).
- Added **39 bilingual CZ/EN questions** (easy/medium/hard for each illustration), four unique options and one validated correct answer per question.
- The artwork portrays AFK, lag, ghosting, clickbait, speedrun, Caps Lock, spoilers, copypasta, ratio, plot twist, ragequit, 404, and a stalled update.
- Extended **Memes, Survival and Endless** clients to display only the first-party `https://foxey-cz.github.io/GuessTheGame-Web/quizoria/media/vq-[a-z0-9-]+.svg` URLs and existing Commons images.
- Added original artwork badge to the Meme lobby, updated the standalone game bundles and the Arcade launcher cache versions.
- Media Library **1.1** presents 13 thumbnail previews with rights, direct SVG sources, and authorship notes: [open the gallery](https://foxey-cz.github.io/GuessTheGame-Web/arcade/media-library.html#original-visuals).

## Rights provenance

- **Artist/owner:** FOXEY Arcade. The SVGs were hand-authored using code primitives for this project. Source artwork is committed to the FOXEY Arcade GitHub repository.
- **License designation:** "FOXEY Arcade Original Art (project-owned)". This is permission for the owner's commercial project use, **not a CC license offered to third parties**.
- Media Library records include `source_url`, `evidence_source`, `license_url`, `verified_at`, and commercial/redistribution flags; approval changes are logged in `foxey_media_audit_log`.
- Old **39 quarantined questions remain quarantined**; no copycat reproductions or wholesale remapping of old question answers was performed.
- Existing third-party images stay subject to independent attribution and rights assessment before commercial launch.

## Data, rollout and reversibility

Additive SQL: `supabase/quizoria_visual_quiz_1_0_original_art_20261111.sql`.

- 13 newly approved media entries; 39 new question rows and 13 approval audit log receipts. All inserts are idempotent.
- Database after deployment: **168 total meme questions / 129 eligible / 39 held**; **31 approved image assets** including 13 new originals, plus 12 approved original emoji motifs.
- All original IDs and image references are intact. Existing saves, currency, global XP, achievements, user accounts, challenge receipts, finished results, and reward functions are not modified.
- To temporarily withdraw a new visual for safety, change its `foxey_media_assets.status` from `approved` to `review` and log the status change. The existing rights gate prevents future selection and masks previously saved media without erasing score history.

## Verification (2026-11-11)

1. Live Supabase database query confirmed all **13 assets** approved with **39** original questions; each asset has one each of easy, medium, hard, four answers and valid index.
2. Sampled **25** deterministic `arcade_private.quizoria_meme_pick('classic', seed)` runs (250 questions): 10 per run, 0 unapproved selections, 43 distinct asset keys, 90 original-visual selections in this sample.
3. `tests/visual-quiz-originals.cjs`: verified all 13 script-free SVG files, source metadata, 39 SQL question records, catalog gallery, whitelisted renderers and cache refresh.
4. Dedicated GitHub Actions workflow `verify-visual-quiz.yml`: **passed**. Broad Arcade platform regression workflow: **passed** at commit `79d9c25b`.
5. Browser-level click-through on the user's device is still **recommended** to verify final appearance, custom-font rendering, image downloads and mobile interactions. Backend, static tests and CI do not replace that final visual confirmation.

## Suggested manual acceptance flow

1. Open the public [Quizoria](https://foxey-cz.github.io/GuessTheGame-Web/secure-quiz-beta.html?v=foxey-visual-quiz-10-20261111a) from Arcade. Log in as usual.
2. Launch Memes → Classic, then Memes → Easy / Medium / Hard; verify visual question artwork appears instead of an emoji placeholder on new illustration keys. The question matches the picture and the credited SVG opens.
3. Play Survival and Endless with the Meme category; ensure approved first-party images render in both without blocking the game.
4. Verify an existing saved game and friend challenge still resume. Check currencies and XP have not changed unexpectedly.
5. Open Media Library 1.1 and inspect the original-art gallery; links should resolve to individual SVGs.

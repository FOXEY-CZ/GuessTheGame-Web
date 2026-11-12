# FOXEY Arcade — Memes 2.0 (12 November 2026)

## Goal
The Quizoria **Memes** category must be about actual recognizable meme pictures, names, famous captions and visual punchlines. It must not be a technical or generic internet-knowledge quiz.

## Changes
- Category renamed from **Memy a internet / Memes & Internet** to **Memy / Memes**. The existing internal `memes` category ID was retained.
- 12 individually approved CC/public-domain source meme images are stored locally under `quizoria/media/commons/meme-*`. Each is mirrored from the source retained in Media Library, with exact author, license, source file URL, download URL and SHA-256 checksum in `local-credits.json`.
- 36 original server-side question rows (12 images × three difficulties) were rewritten in place, **retaining IDs**, to ask about the meme identity, caption, recognizable reaction, or joke. Existing saved snapshots and previously answered questions are not rewritten.
- 24 additional bilingual meme questions are stored in a private, RLS-enabled bonus question bank. Survival chooses **60 meme questions (20 per difficulty)** and Endless has 20 per difficulty, without technical trivia, VQ illustrations or emoji-only placeholders.
- Regular, daily and friend challenge creation use only local, rights-approved meme images. Existing daily sessions and previously issued friend challenges retain their original content for fairness.
- Approval and attribution still rely on the existing Media Library gate. The public server view rewrites old approved Wikimedia hotlinks to first-party local copies without modifying saved run history.
- Existing held/blocked images stay quarantined. Solo saved runs can repair unplayed unavailable questions; historical scores, wallets, XP, achievements and finished results are preserved.

## Regression and acceptance
- [x] 12 pictures mirrored and content SHA-256 verified in GitHub Actions.
- [x] 36 core + 24 bonus = **60 bilingual meme-related questions**; every tier has 20.
- [x] 40 simulated classic rounds returned 10/10 locally hosted meme images, none external.
- [x] Survival server picker returns 60/60 local meme images, 20 per difficulty, with **no VQ/emoji trivia**.
- [x] Endless mode has 20/20 local meme questions in its medium tier.
- [x] Live backend smoke test: `quizoria_survival_begin` and `quizoria_endless_begin` returned real meme photos and valid runs (rollback).
- [x] Live backend smoke test: saved solo `quizoria_meme_resume` preserved previous answers and score while substituting safe meme media (rollback).
- [x] GitHub Actions Visual Quiz and platform stability workflows passed.
- [x] GitHub Pages deployment completed successfully.

## Remaining considerations
- Twelve unique meme images means a long Survival game repeats some pictures with **different** questions. Increase the licensed library over time to add variety.
- A prior issued daily/friend challenge can still contain original old questions until its shared run ends.
- Final appearance and browser caching must be tested manually on a phone.
- Full legal rights are not guaranteed merely by a Commons label; each external asset retains source attribution and commercial-use review.

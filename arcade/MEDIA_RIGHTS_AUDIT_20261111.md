# FOXEY Arcade — Media Library 1.0: meme-rights follow-up
**Reviewed:** 2026-11-11 · **Project:** FOXEY Arcade / Quizoria · **Scope:** 18 previously unapproved meme images, 3 questions per image.

This is a practical editorial/source audit, **not a legal opinion or warranty**. A Commons license label alone does not establish ownership of all underlying components, trademarks, portrait/publicity rights, or other rights in every territory. The application is intended for potential commercial publication, so unresolved assets stay quarantined.

## Database snapshot after review

| Asset type | Approved | Under review | Blocked |
|---|---:|---:|---:|
| Images | 18 | 11 | 2 |
| Original emoji-based quiz visuals | 12 | 0 | 0 |

There are **129** meme questions: **90** eligible and **39** quarantined after second-pass review. All **12** original emoji-based quiz visuals remained unchanged. The six new image approvals initially restored **18** questions; a later second-pass quarantine of one previously approved image removed **3**, resulting in a net improvement of **15** playable questions. Saved rounds, challenge history, users, rewards, balances, and question IDs were not changed in this follow-up.

## Six newly approved works

| Asset key | Credits and file evidence | Licenses / reasoning |
|---|---|---|
| `q23meme-touch-grass` | [JPxG original photograph](https://commons.wikimedia.org/wiki/File:Touch_grass.jpg) | CC BY-SA 4.0, own work, commercial redistribution allowed with credit / SA on adaptations |
| `qm13-meerkat2024` | [Callumhand own meme photo](https://commons.wikimedia.org/wiki/File:Meerkat_meme.jpg) | CC BY 4.0, author credited |
| `rickqr` | [HelloAdi5501 QR code](https://commons.wikimedia.org/wiki/File:RickRoll_QR_Code.png) | CC BY-SA 4.0; only the code graphic is used, not embedded song/video |
| `q23meme-wikicat-citing` | [PlanespotterA320 derivative](https://commons.wikimedia.org/wiki/File:Citing_ur_sources.jpg) based on [slava photo](https://commons.wikimedia.org/wiki/File:Cat_keyboard.jpg) | CC BY 2.5 derivative / CC BY 2.0 original. Both contributors credited |
| `q23meme-wikicat-stubs` | [PlanespotterA320 derivative](https://commons.wikimedia.org/wiki/File:Expanding_ur_stubs.jpg) based on [slava photo](https://commons.wikimedia.org/wiki/File:Cat_keyboard.jpg) | CC BY 2.0; both contributors credited |
| `qm13-jsonkitty` | [MaxSem meme](https://commons.wikimedia.org/wiki/File:Use_JSON_server_kitty.jpg) derived from [Tim Avatar Bartel photo](https://commons.wikimedia.org/wiki/File:Server-kitty.jpg) | CC BY 2.0 option documented for both; other GFDL / CC BY-SA options shown on Commons were noted; both contributors credited |

The application only scales the Commons images responsively; no new derivative graphics are distributed by this release. If images are modified, recheck every relevant attribution, ShareAlike, and license obligation.

## Ten sources inspected but **not approved**

| Key | Unresolved issue | Suggested compliant replacement |
|---|---|---|
| `awesome` | Original creator unknown; uploader CC0 claim is not evidence of the creator's waiver | Independently created smiley expression with distinct appearance; new question |
| `grumpy` | CC-licensed photo, but branded Grumpy Cat image / meme derivation merits separate commercial rights review | Different licensed cat photograph + new non-branded trivia |
| `q23meme-morgan-true` | Modified celebrity publicity photo from NASA / Discovery material; portrait and composite permissions unresolved | Non-celebrity original reaction visual + new question |
| `q23meme-pizza-cat` | Commons PD-USGov claim visible; underlying official USAF source and international reuse need further verification | Officially attributed government original with confirmed provenance, or separately licensed photo |
| `q23meme-xzibit-concert` | Original photograph CC BY-SA 3.0 DE, meme-overlay origin and attribution chain not fully substantiated | Original approved photo without derivative overlay, with correctly adapted prompt |
| `qm13-explorer` | Explorer branding and third-party icon rights not reviewed | Generic original browser illustration, avoid Microsoft marks |
| `qm13-wikipetan` | Commons expressly warns about Wikimedia trademarks; derivative file | Original fictional mascot unrelated to Wikimedia designs |
| `rickevent` | CC-licensed photo contains third-party copyrighted song lyrics visible in image | An original presentation parody without lyrics |
| `vim` | Screenshot includes Stack Overflow UI and underlying contributors' text | Original text UI mock-up about exiting a fictional editor, not a copied screenshot |
| `wojak` | CC0 claim by vectorizer does not confirm rights to original Wojak design | Independently illustrated original reaction character |

### Second-pass check of previously approved media (2026-11-11)

The original 13 approved images were also re-examined. One earlier approval was conservatively revoked:

- `q23meme-replaying-prince`: **approved → review**. The author Nicky Case explicitly dedicates their own work to CC0 ([source](https://commons.wikimedia.org/wiki/File:REPLAYING_the_game_Fresh_Prince_of_Memes.jpg)), but this particular screenshot includes a Fresh Prince of Bel-Air parody and Team Fortress 2 character references. Their own CC0 dedication cannot automatically waive third-party copyrights or relevant likeness rights. Three questions are now withheld. No game progress, original question IDs, saved rounds or scores were erased.

One approved attribution was corrected without changing status:

- `doge`: likeaduck created the underlying CC BY 2.0 photograph and Belbury added/cropped/edited the meme typography according to the [Commons file history](https://commons.wikimedia.org/wiki/File:Doge_meme_example.jpg). The public media register now credits both.

The [original artwork](https://commons.wikimedia.org/wiki/File:Reimer_Librarian.jpg) underlying [Open access meme.gif](https://commons.wikimedia.org/wiki/File:Open_access_meme.gif) is an 1850–1866 painting by Georg Reimer, with public-domain art status. This resolved the specific underlying copyright concern for that previously approved derivative; image reproduction conditions may still warrant jurisdiction-specific review.

Current totals after this second pass: **18 approved images, 12 approved original emoji motifs, 11 images under review, 2 blocked images**; **90 eligible and 39 held quiz questions**. The 20-seed quiz selection smoke test must be rerun for these totals (and the public register updated).

### Two existing blocked images remain blocked

- `fine`: derived from KC Green's protected **This Is Fine** comic; an unrelated CC license cannot clear the original comic.
- `troll`: uploader's CC0 claim does not establish rights to the original **Trollface** illustration.

Do **not** replace these with near-identical redraws of the protected characters. Create a distinct image plus genuinely new question/answer metadata instead.

## Data changes and tests

- Live project: **FOXEY Arcade**, schema `arcade_private`; table `foxey_media_assets`.
- Changed exactly **6** rows from `review` to `approved`. Evidence URL, contributor attribution, licensing flags, and `verified_at` populated.
- Added exactly **6** corresponding `foxey_media_audit_log` records.
- Updated the existing ten unapproved rows with individual reason notes and added **10** audit-log entries retaining `review`; no change to their effective rights status.
- The previous two blocked rows and all approved/emoji assets were untouched.
- Smoke query over `arcade_private.quizoria_meme_pick('classic', seed)` with 20 distinct seeds returned **200** questions across 20 full sets of 10, **0 unapproved selections**, **30 distinct approved asset keys**.
- Web register `arcade/media-library.html` updated to correspond to live totals and show approved author/license/source metadata.
- **No changes** to account identity, saved games, progress, XP, wallet, achievement logic, reward functions, or question IDs.

## Future replacement workflow

1. Design a truly independent visual subject (not a near-copy of famous memes); prefer self-owned commissioned/created graphics or defensible source photos.
2. Save an asset with **source URL, author, license, commercial rights, modifications, version, and evidence** in the shared media registry.
3. Create new quiz questions with answer options that actually match the *new* visual; do **not** relabel an old image while retaining incompatible answers.
4. Release the asset only after editorial + legal-source review and set `approved` with audit-log evidence.
5. Re-run the image gate and saved-round masking tests; preserve old quarantined questions and historical scores without rendering the old image.
6. Update the public credit register to match the live database. Recheck the licenses and international use before monetization.

**Rollback:** For each newly approved asset, set `status='review'`, `commercial_use=false`, `redistribution_allowed=false` in a reviewed corrective transaction, append a matching audit-log entry, and update the public credit list. This is a *future procedure*, not an executed rollback.

## Sources

All individual file pages are linked in the relevant rows above. In addition, [Creative Commons FAQ](https://creativecommons.org/faq/) and [Wikimedia Commons licensing guidance](https://commons.wikimedia.org/wiki/Commons:Licensing) explain why uploader licenses and underlying rights need care.

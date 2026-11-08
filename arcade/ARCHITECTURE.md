# FOXEY Arcade — production architecture & maintenance

Last reviewed: **2026-11-08**. This is a living architectural contract for the launcher, **not** a description of Guess the Game alone.

## Canonical ownership

| Part | Canonical source | Responsibilities |
| --- | --- | --- |
| Public launcher | \`FOXEY-CZ/GuessTheGame-Web/arcade/\` | UI, player account, navigation, library, shared notifications, achievements, wallet, friends, missions, profile |
| First game | \`FOXEY-CZ/GuessTheGame-Web/secure-quiz-beta.html\` | Quiz modes, questions, per-game progress, rounds and in-game rendering |
| Auth bridge | \`FOXEY-CZ/GuessTheGame-Web/account-test.js\` + \`account-config.js\` | Shared Supabase login session, legacy game/cloud-save bridge |
| Database | Existing **FOXEY Arcade** Supabase project | Authoritative XP/currencies, secure questions, game results, missions, friends, live matches and series |
| Private source/history | \`FOXEY-CZ/FOXEY-Arcade\` | Backend migrations, rollback-only SQL QA, release docs, selective mirrored frontend modules |

**Deploy changes in the public \`GuessTheGame-Web\` repo.** Updating the private repo frontend alone **does not update GitHub Pages**. The original database was renamed from GuessTheGame to FOXEY Arcade; do not create a second database or copy player progress between projects.

## Platform contracts (for EVERY future game)

1. **One player identity.** Account, profile, friend relationships, presence, privacy and preferences are global Arcade services, not replicated in every game. On logout/account switch, clear private UI state and cancel or ignore in-flight requests.
2. **One wallet.** Crowns, shards, reward claims, chests and cosmetics belong to Arcade; game UIs only render those values and request server-authorized transactions. Never write credits or XP directly from a browser, even if hidden by a button.
3. **Global and game-specific XP remain distinct.** Each game may track its own modes, saves, levels, history and game-specific achievements. Arcade grants global XP only through server-receipted events with replay protection.
4. **Shared multiplayer transports; game-specific rules.** Accounts, invites, lobby consent, reconnect, friend blocks, social notices and match ownership are platform-level. Question selection, scoring, rules, series outcomes and answer keys remain server-side game-specific systems.
5. **Private game data.** Do not expose another user's saves, answer keys or earnings in client payloads, URLs, public Realtime channels or browser logs. Shared iframe messages require verified origin and sender.
6. **Independent game registration.** New playable games should receive a stable game ID, separate route and own game-save API. Avoid hardcoding Guess the Game-only assumptions into shared nav, wallet or friend APIs. A multi-game catalog/registry is the *next architectural milestone*, not a prerequisite for fixing existing production code.
7. **Game isolation.** Switching between Arcade menus must not reset an active embedded game. Switching account must unload its previous iframe and clear cached account-specific data.
8. **Versioned frontend assets.** Bump cache query parameters after changing loaded JS/CSS or the embedded game, especially for mobile browsers.
9. **Prefer additive migrations** and rollback-only regression fixtures. Never delete existing wallets, saves, profile rows, history or old legacy URLs during a cleanup.

## Current UX boundaries

- **Arcade (platform):** Home, Games, Play, Store, Challenges, Missions, Friends/Live, Account, Settings, notifications.
- **Guess the Game:** The first playable game under Play, with a legacy fallback and standalone secure game route. Future games (Guess the Meme, Draw & Guess, Mini Golf) are placeholders, **not released games**.
- **PvP:** Classic / Speed / Mystery, direct invite, rematches, BO3/BO5, friends' head-to-head history. Current live duel scoring is independent of the shared economy.

## Quality gates

1. \`.github/workflows/verify-arcade-platform.yml\` — new **cross-game**, on every relevant frontend/game/auth change and pull request. Checks all local JavaScript syntax; routes and asset links; shared auth, wallet, global/game XP boundaries; player-data separation; comprehensive mock browser tests.
2. \`.github/workflows/verify-arcade-public.yml\` — targeted Arcade UI and social/multiplayer regressions, plus published page availability.
3. \`.github/workflows/verify-auth-preview.yml\` — login, account merge and guest/account isolation.
4. \`.github/workflows/verify-guess-the-game.yml\` — original game, question content and cloud-save regressions.

All JavaScript tests are offline simulations; **a passing build is not a substitute for two real devices**. For each release confirm sign-in/out, switching account, shared economy, mobile navigation, save/resume, notifications and at least one gameplay action in the affected game.

## Known limitations / follow-up

- Legacy standalone quiz pages remain in this repository for compatibility and must not be treated as the canonical launcher.
- \`arcade/app.js\` still contains some Guess the Game-specific UI/progression code. **Do not physically move it in a mass refactor** before a game registry, migration plan, end-to-end fixtures and backup/recovery plan are in place.
- Supabase Auth security advisor currently reports **leaked password protection disabled**; review and enable in Auth configuration before a broader public release. Database advisors also flag intentionally RPC-only private tables and several executable SECURITY DEFINER functions. Review these per API, not by indiscriminately changing their permissions.
- Performance advisor lists some unindexed foreign keys and two log tables without PKs. Evaluate query plans and retention policy before any index/schema changes.
- All automatic checks must stay green; if a legacy test fails because of a renamed server-verified status or a changed UI structure, update its assertion **to the current secure contract** instead of merely deleting the test.

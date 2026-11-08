# FOXEY Arcade — Platform + Guess the Game polish (2026-11-08)

## Scope
This release improves **both** the shared multi-game launcher and the first game **Guess the Game**. Production frontend is \`FOXEY-CZ/GuessTheGame-Web\`, with server-owned Supabase progression unchanged.

## Arcade launcher
- Home **Quick Access** to Game Library, Friends/Live Duels, Missions, and the common Shop. Each action uses the existing \`data-page\` router (no separate sign-ins or duplicate game state).
- Game library clearly distinguishes **available** Guess the Game from **upcoming, unplayable** Guess the Meme, Draw & Guess and Mini Golf.
- Responsive two-column/one-column quick-action cards and English translations for all new static launcher labels.

## Guess the Game
- Mode screen is organized into three accessible tabs: **Solo / Friend Challenges / History**, with contextual page heading and description. Keyboard tab navigation uses arrows/Home/End. Switching between these menu tabs makes **no server write** and does not reset a quiz.
- Existing **Solo** modes keep all six modes and new/continue functionality.
- **Friend Challenges** retains the exact original create/join/result actions, and moves the long recovery tutorial into optional, collapsed help; the launcher challenge action and \`?view=challenges\`/invite deep links open the corresponding tab before scrolling.
- **History** contains live async challenge history, refresh, archive and results. The global bell/overlay remains independent and fully usable.
- A compact play layout hides only the large informational hero while playing or showing a finished result, leaving the important app header/notifications available.
- Desktop keyboard: **1–4** select an enabled answer, **Enter** goes to the next question. This invokes existing browser buttons and therefore the same **server-verified** RPC. Shortcuts do nothing while typing, while overlays are open, or if the action is pending/disabled.
- Corrected static fallback copy to reflect verified live rewards (no obsolete “rewards in testing” banner). Clarified the recovery help and translated the new game tabs/keyboard help to English.

## Automated verification
- \`tests/arcade-platform-stability.cjs\` protects multi-game links, upcoming-game separation, tab routing, translations, external game assets and shared wallet/auth boundaries.
- \`tests/secure-quiz-beta-client.cjs\` now checks tab changes and context heading without game state changes, plus input-safe numeric shortcut use on a server-issued question.
- Existing platform-wide tests additionally cover sign-in, saves, cloud revision safety, rewards, solo resume, two-player async challenges, live rematches, BO3/BO5, notifications, reports and leaderboard.
- No Supabase migration, no wallet operation, no profile or save modification was required.

## Real-device smoke checks
1. Update/refresh Arcade on phone and desktop; verify four quick actions open the right page.
2. Visit Games: Guess the Game is playable, the three planned games cannot be launched.
3. Open Guess the Game: change Solo → Friend Challenges → History → Solo, then start/continue a game. Ensure score and save remain intact.
4. Start a private challenge from the Arcade launcher and from a challenge URL; both must open the Friend Challenges panel or the secure game flow without a blank screen.
5. Finish an answer on mobile and check the compact header layout; on PC test 1–4/Enter, focusing a text input, and opening a modal while pressing 1.
6. Confirm existing mission rewards, global wallet, cloud saves, live duels and series are unchanged.

## Outstanding
Real physical-device layout and browser cache validation remain necessary; automated DOM/browser-session mock regressions do not substitute for genuine mobile testing. Further splitting of shared APIs for future games is **not part of this polish release** and needs its own tested 2.0 migration plan.

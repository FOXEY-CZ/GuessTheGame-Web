# FOXEY Arcade — Immersive games, direct friend invites and bell UX (2026-11-08)

## Summary
This is a **multi-game launcher usability** update. The current playable Guess the Game reuses the same existing Supabase Auth identity, cloud saves, friend relationships, missions, currencies, verified question bank, live duels and shared notifications. No database schema changes or wallet migrations.

### Launcher — fullscreen
- Opening the Play route immediately enters an immersive, viewport-filling game stage.
- It requests the **native Fullscreen API** synchronously from the initiating click where available. If a browser rejects native fullscreen (notably iOS Safari), it retains the CSS fullscreen-like viewport fallback; browser chrome may remain visible.
- The embedded game iframe is **not reloaded** by exiting fullscreen or browsing other launcher menus. User-triggered account change still intentionally unloads it for privacy.
- Explicit **Režim okna / Windowed mode** control, with Escape support for native fullscreen, and **Zpět na hry** navigation. The game retains its own in-game back-to-platform action.

### Launcher — mobile
- Bottom dock: **Domů / Hry / Výzvy / Přátelé / Více**.
- **Obchod** moved into More, along with Missions, Account, Settings and direct launch. Normal desktop navigation remains unchanged.
- Friends now highlights directly in bottom nav, instead of highlighting More.

### Guess the Game — challenge accepted friends directly
- Under **Výzvy s přáteli**, the game retrieves the authenticated player's accepted friend list via the pre-existing \`arcade_friends_dashboard\` RPC. This is not a public username search or an exposed table.
- **Poslat výzvu** uses \`arcade_friend_challenge_create\` with a stable per-user/per-friend operation ID across network retries; it launches the secure creator run, never a second independent rewards system.
- **Živý duel** sends a same-origin, iframe-source-verified navigation intent to the parent launcher; the launcher performs its existing authorized \`FOXEY_ARCADE_LIVE.invite\` flow. In standalone mode the launcher can receive a one-use \`invite_live\` URL parameter and then remove it before initiating an authenticated invite.
- When another server game is currently unfinished, attempts to launch another are blocked rather than destroying the running quiz.
- All friend cards use textContent (no HTML or email exposure); every action still goes through the established server friendship/block controls.

### Bell — explicit actions, discreet archive
- Shared launcher bell now shows **View/Open**, **Accept** for pending friend or live invites, and **✕ Hide**. Friend requests additionally support a clearly labelled Decline action.
- **X is NEVER a decline**. It only calls the existing owner-scoped notification archive endpoint. Pending matches/friendships are not cancelled by hiding. Async challenges that cannot be archived while unfinished remain visible until completion/expiry under existing backend safeguards.
- Accepting/declining a request executes existing owner-validated \`arcade_friend_respond\` or \`arcade_live_respond\` RPC, marks notice seen and moves the dealt-with notification to the restorable history.
- A collapsed **Starší a skrytá oznámení** disclosure replaces the prominent Archive button. Archive/restore are still available there without deleting history.
- The embedded game's own bell now also shows Accept and X-hide, with the same owner-scoped backend logic and concealed history view.
- All new UX has Czech and English labels.

### Testing and constraints
- Source-wide platform stability workflow plus Arcade preview and independent Auth workflow.
- \`tests/arcade-game-fullscreen-client.cjs\` verifies native fullscreen, fallback, visible exit, browser Escape and preservation of the existing iframe.
- \`tests/secure-game-friend-picker-client.cjs\` simulates a signed-in friend picker, a targeted invitation and live intent without duplicate runs or balance writes.
- \`tests/arcade-friends-client.cjs\` simulates one-tap acceptance in the bell, scoped X-hide and old live/rematch flows.
- \`tests/arcade-ui2-navigation-client.cjs\` checks bottom dock tab ordering.
- The prior 26+ checks still cover singleplayer, cloud sync, missions, wallets, daily rewards, async challenges, two-player live duels and series.
- **Real physical device acceptance remains to be performed.** In particular, iPhone Safari may be viewport-immersive rather than true system fullscreen because browsers limit the Fullscreen API. Never promise that browser chrome vanishes on every OS.
- If on a live invite, **hiding** is not **declining**. The player can still enter the match from Friends; explicit Decline happens in lobby, or a friend request has its own Decline button.

### Real-world smoke check
1. On two phones, refresh Arcade, tap Games → Play. Confirm the viewport fills and both Back to Games and Windowed Mode work. Confirm switching tabs doesn't lose the saved quiz.
2. On mobile bottom navigation, tap Friends directly. Find Shop under More and verify account/missions/settings still exist.
3. In Guess the Game → Friend Challenges, see your actual accepted friend, create an async invitation; on their phone receive the notice. Also tap Live duel and check that Arcade opens the lobby on the requesting device.
4. In the bell, press Accept for a friend/live invite, test X on a different notification. Confirm X hides without declining a pending duel, and handled items appear under the collapsed hidden history.
5. Check language switch, unread badge, sign-out/account switching and iOS Safari fullscreen fallback.

# FOXEY Arcade — deployment notes

FOXEY Arcade beta lives at `/GuessTheGame-Web/arcade/` and uses `arcade/index.html`, `arcade/app.js` and `arcade/styles.css`.

GitHub Pages publishes from `main` / `(root)`. This file records a clean rebuild trigger on 2026-11-06 following a timed-out GitHub Pages deployment (#107). No game state or account data was changed.

Verification after successful Pages deployment:
- Login screen contains `Zapomenuté heslo?` below password sign-in.
- Anonymous visitor is treated as Guest, not a connection failure.
- Recovery link redirects to the allowlisted `https://foxey-cz.github.io/GuessTheGame-Web/arcade/?auth=recovery`.
- Test recovery only with an account you control; verify email delivery and session validation before marking this feature complete.

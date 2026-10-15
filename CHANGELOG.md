# Changelog

## Unreleased

- Each named deploy environment now also has its own `SESSION_SECRET` and `UPTIME_RUNNER_KEY` in `.rer/deploy/environments/<environment>/secrets.json`, so a session or runner key from one environment is refused by another; environments deployed earlier keep their values. First-run setup names the environment's settings file, and `node scripts/runner-start.mjs --environment NAME` starts that environment's runner. `@runeditrun/rer` is pinned to 0.2.11.
- Each named deploy environment now has its own one-time setup token, kept in `.rer/deploy/environments/<environment>/secrets.json`; the deploy hook returns the token it deployed so rer can claim the owner, and environments deployed earlier keep their token. `@runeditrun/rer` is pinned to 0.2.9.
- Runner handoffs no longer reset incident confirmation or recovery while older undelivered checks await a skip decision; skipped checks still show missing coverage.
- Console controls added while an action is finishing stay disabled until its latest read completes, and an unexpected concurrent action asks the operator to wait rather than silently dropping the click.
- Browser flows remove their private profile folder even if the runner is killed while the browser is launching.
- The Verify job limit increases from 30 to 40 minutes because the complete suite can take 29.7 minutes.

- Browser flows also remove a credential the site echoes with its case changed and percent-encoded (an accented sign-in address in a lowercased path) or encoded twice (`%2540`); a check that a lagging vantage skipped no longer resets confirmation or recovery, so an incident both vantages see is confirmed while one of them lags steadily by more than an interval.
- Browser flows remove credential values before cutting a URL to 300 characters, so a value across the cut is no longer stored nearly whole, and match each character as typed or percent-encoded, so a sub-addressed sign-in echoed with only its '@' escaped is removed too; a vantage that falls behind skips the checks it missed rather than running two of its own checks back to back, and each skipped check keeps that vantage's part as missing evidence.
- Browser flows replace every named credential value in their trace, final URL and reason with `[credential]`, keep profiles in a runner-owned 0700 folder that a hard stop cannot leave behind, label a recovery after a type change as a changed definition, and hold the flow limit under concurrent saves; an email whose claim release fails returns to the queue when its claim expires and is sent once, and each vantage keeps a full interval between its own scheduled checks.

# Changelog

## Unreleased

- Browser flows also remove a credential the site echoes with its case changed and percent-encoded (an accented sign-in address in a lowercased path) or encoded twice (`%2540`); a check that a lagging vantage skipped no longer resets confirmation or recovery, so an incident both vantages see is confirmed while one of them lags steadily by more than an interval.
- Browser flows remove credential values before cutting a URL to 300 characters, so a value across the cut is no longer stored nearly whole, and match each character as typed or percent-encoded, so a sub-addressed sign-in echoed with only its '@' escaped is removed too; a vantage that falls behind skips the checks it missed rather than running two of its own checks back to back, and each skipped check keeps that vantage's part as missing evidence.
- Browser flows replace every named credential value in their trace, final URL and reason with `[credential]`, keep profiles in a runner-owned 0700 folder that a hard stop cannot leave behind, label a recovery after a type change as a changed definition, and hold the flow limit under concurrent saves; an email whose claim release fails returns to the queue when its claim expires and is sent once, and each vantage keeps a full interval between its own scheduled checks.

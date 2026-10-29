# Saved Site24x7 monitor lists

Open Definitions and choose a saved successful monitor-list response from the
[Site24x7 API documentation](https://www.site24x7.com/help/api/) (read 23 October 2026).
Preview reconciles every record as converted, refused or unsupported. Review each
field difference, then apply paused definitions; re-importing the same settings is
unchanged. Undo retains created monitors paused and preserves their history.

Complete Website and REST API settings preserve URL, method and accepted status
codes/ranges. Plain Port settings become TCP checks; Ping settings become private
runner ICMP checks; DNS settings can use the installed Cloudflare or Google resolver
choices. DNS transport becomes HTTPS and is stated in the preview. Unsupported
resolvers, answer/TTL criteria and DNSSEC are named rather than silently dropped.
Timeout limits, local confirmation/recovery and the Ping packet/loss/RTT defaults
are shown before apply. Credentials and custom request payloads are withheld and
require separate review. Existing provider status-address and StatusIQ mappings
continue to use the service catalog.

Browser transactions require FLOW-001/FLOW-002 conversion; TLS and domain expiry
require TLS-001/DOMAIN-001; heartbeat thresholds need HEARTBEAT-004 review. Locations,
threshold groups, notification profiles/groups, accounts, reports, history and
live extraction are not transferred. Reconcile these and test side by side before
cutover. This saved-file slice creates no recipient and sends no notification.

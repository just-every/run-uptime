#!/usr/bin/env bash
# Bash + curl + Node 22+. One private state directory per monitor, on one host.
set -u
umask 077
: "${UPTIME_HEARTBEAT_URL:?Set the receipt URL without a state suffix}"
: "${UPTIME_HEARTBEAT_TOKEN:?Set the key shown once by Uptime}"
: "${UPTIME_HEARTBEAT_STATE:?Set an absolute private state directory}"
[[ $# -gt 0 && "$UPTIME_HEARTBEAT_URL" =~ ^https?://[^\ \?\#]+/api/heartbeats/[^/]+$ && "$UPTIME_HEARTBEAT_TOKEN" =~ ^[a-zA-Z0-9_-]+$ && "$UPTIME_HEARTBEAT_STATE" == /* ]] || exit 64
[[ ! -L "$UPTIME_HEARTBEAT_STATE" ]] || exit 73
mkdir -p "$UPTIME_HEARTBEAT_STATE" || exit 73
chmod 700 "$UPTIME_HEARTBEAT_STATE" || exit 73
lock="$UPTIME_HEARTBEAT_STATE/run.lock"
mkdir "$lock" 2>/dev/null || { echo 'A run is active or left a lock; investigate before removing run.lock.' >&2; exit 75; }
trap 'for file in empty.json output.json sequence; do [[ ! -f "$lock/$file" ]] || unlink "$lock/$file"; done; rmdir "$lock" 2>/dev/null || true' EXIT
sequence_file="$UPTIME_HEARTBEAT_STATE/sequence"
[[ ! -L "$sequence_file" ]] || exit 73
ping_job() {
 local state="$1" body="$2" sequence=0
 if [[ -f "$sequence_file" ]]; then read -r sequence < "$sequence_file"; fi
 [[ "$sequence" =~ ^[0-9]+$ && ${#sequence} -le 15 ]] || return 65
 sequence=$((10#$sequence + 1))
 printf '%s\n' "$sequence" > "$lock/sequence" && mv "$lock/sequence" "$sequence_file" || return 73
 # The key stays off the command line. There are no automatic transport retries.
 curl --fail --silent --show-error --max-time 15 --request POST --config - --data-binary "@$body" <<CURL
url = "$UPTIME_HEARTBEAT_URL/$state"
header = "Content-Type: application/json"
header = "Authorization: Bearer $UPTIME_HEARTBEAT_TOKEN"
header = "X-Heartbeat-Sequence: $sequence"
CURL
}
printf '{}' > "$lock/empty.json"
ping_job start "$lock/empty.json" >/dev/null || exit 69
# Drain all command output while retaining only a body which fits the 10 KiB ingress bound.
"$@" 2>&1 | node --input-type=module -e '
let chunks=[],size=0;for await(const chunk of process.stdin){if(size<8000){const kept=chunk.subarray(0,8000-size);chunks.push(kept);size+=kept.length}}
let output=Buffer.concat(chunks).toString("utf8"),body;while(Buffer.byteLength(body=JSON.stringify({output}))>10000)output=output.slice(0,-100);process.stdout.write(body);
' > "$lock/output.json"
results=("${PIPESTATUS[@]}")
result="${results[0]}"
if [[ ${results[1]} -ne 0 ]]; then echo 'Command output capture failed; no finish receipt was sent.' >&2; [[ "$result" -ne 0 ]] && exit "$result"; exit 74; fi
if [[ "$result" -eq 0 ]]; then
 ping_job success "$lock/empty.json" >/dev/null || { echo 'Job succeeded; success receipt was not accepted.' >&2; exit 69; }
else
 ping_job "fail/$result" "$lock/output.json" >/dev/null || echo 'Job failed; failure receipt was not accepted.' >&2
fi
# Remove only this run's known private files.
for file in empty.json output.json; do unlink "$lock/$file"; done
exit "$result"

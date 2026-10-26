#!/usr/bin/env bash
# Reuse only the newest same-repository push run of this workflow.
set -euo pipefail
wf="${WF_REF%@*}"; wf="${wf##*/}"
newest_push() {
  gh api "repos/$GITHUB_REPOSITORY/actions/workflows/$wf/runs?head_sha=$1&event=push&per_page=100" \
    --jq "[.workflow_runs[] | select(.event == \"push\" and .head_sha == \"$1\" and .head_repository.full_name == \"$GITHUB_REPOSITORY\" and .id != $GITHUB_RUN_ID)] | max_by(.id) | select(. != null) | \"\(.status) \(.conclusion)\"" || true
}
green() { [ "$(newest_push "$1")" = 'completed success' ]; }
skip=false
# C1: main reuses the candidate's green push on this exact SHA.
if [ "$EVENT" = push ] && [ "$REF" = refs/heads/main ] && green "$GITHUB_SHA"; then skip=true; fi
# C3: exact parent tree, never a path subset. Tags retain the complete slow tier,
# which a branch push does not prove; schedule and dispatch also always run it.
if [ "$skip" = false ] && [ "$EVENT" = push ] && [[ "$REF" == refs/heads/* ]] \
   && parent=$(git rev-parse -q --verify HEAD~1) \
   && [ "$(git rev-parse 'HEAD^{tree}')" = "$(git rev-parse 'HEAD~1^{tree}')" ] && green "$parent"; then skip=true; fi
# C2: a same-repository PR may reuse only its head's green push, never another PR
# or a dispatch (which may select a subset). A running push gets at most 25 minutes.
if [ "$EVENT" = pull_request ] && [ "$SAME_REPO" = true ]; then
  for _ in $(seq 1 50); do
    state=$(newest_push "$PR_HEAD")
    case "$state" in
      'completed success') skip=true; break ;;
      ''|completed\ *) break ;;
      *) sleep 30 ;;
    esac
  done
fi
printf 'skip=%s\n' "$skip" >> "$GITHUB_OUTPUT"

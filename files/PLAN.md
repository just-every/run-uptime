# Plan and scope

1. Read current state of run 43518362117 and its attempt-1 jobs, then read the failed job archive once.
2. Only if the failing shard has not been retried, request POST /repos/just-every/run-uptime/actions/jobs/132206445155/rerun once. Do not rerun successful jobs or dispatch a workflow.
3. Observe that run through REST with one watcher and at least 300 seconds between run-status reads; maximum ten GitHub calls, counting the failed-log invocation once.
4. Shallow-clone only just-every/run-uptime. Read its contributor guidance; compare metadata candidate 7364b5f3dd7fcf29b533d3139315ad1701d0653e with actual fetched main. Prepare only dependencies, local setup and production build. Run the original node tests/operator-security.mjs command once on each exact head with isolated test-owned databases. Use Chromium /usr/bin/chromium and no-sandbox, as required for this VM.
5. Record precise results and environment differences, distinguish a green rerun from a demonstrated cause. No source, test, contract, metadata, clause-status or product-branch changes. No tag, release, deployment, landing, or other candidate rerun.
6. Publish explicit non-secret report and receipt files only on evidence/sd-uptime-release0512-ci-triage-1. Verify product checkout unchanged, remove owned clone and node_modules after successful evidence transfer. Return one dated sd inbox relay with exact head/run/jobs/attempt, results and evidence head. No product READY claim.

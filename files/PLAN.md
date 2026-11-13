# Credential-row readiness continuation plan

1. Preserve e46b7145c4d4ff255e30f5669b5c4394917807c4 and inspect its failed Verify evidence, repository instructions, contract, limiter, console initialization, and existing journey.
2. Build the actual app and run only tests/operator-security.mjs with external, non-secret response diagnostics. Reproduce before changing the readiness wait; distinguish product data/rendering defects from harness timing.
3. Make the smallest forward change in tests/security-controls-browser-support.mjs, preserving every existing credential/security assertion. No new registrations, retries, larger timeouts, application mocks, product changes, contract changes, or limiter-state deletion.
4. Run the affected journey and typecheck; capture the relevant credential screen at 1440 and 390. Keep reports, receipts, and screenshots outside the product repository.
5. Fetch main and merge without rewriting the published starting point. Preserve main's contract and assertions; regenerate sources.lock.json last and check it.
6. Inspect all candidate author/committer identities and trailers, commit the real change with the fleet hook active, and push only cloud/sd-uptime-security-wait-1-pc1 using cloud-push.py.
7. Discover and inspect exact-SHA Verify through REST within ten GitHub calls, with at least 300 seconds between observations of the same run. Fix forward if a scoped failure is repairable. Never dispatch or rerun CI for an existing SHA.
8. Publish explicitly selected non-secret reports and receipts to evidence/sd-uptime-security-wait-1-pc1; report product and evidence custody separately. Delete the owned product clone only once its work and evidence are safely pushed.

Contract status changes: none authorized; no Status, Gap, Evidence, or clause text edits.

Inspection refinement: the saved operator-security journey passes locally. Verify 43395524991 cancelled push-6 during the shard step after about 20 minutes; operator-security is in another shard. Both gh log commands returned exit 0 with no log lines, so no failed assertion can be attributed to the cancellation. The direct exported-helper probe stalled before creating any schema and was stopped by its owned PIDs; it is not application behavior evidence. Reproduction uses the normal tests/operator-security.mjs entrypoint instead.

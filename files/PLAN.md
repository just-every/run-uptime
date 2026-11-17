# Plan and scope

Authored by Run Edit Run fleet, 2026-11-17 UTC.

1. Confirm current main and its exact-SHA Verify; confirm the latest published release and publication date.
2. Compare v0.5.16 with current main, review the five named owner journeys, and inventory all SQL migrations and the exact rer pin. Include the queued setup wording only if it is on main before the product push.
3. Update only existing release metadata to 0.5.17, previousVersion 0.5.16; write buyer-visible notes with accurate import limits and retain backup, upgrade and known-issue cautions. Do not change product, README, contract judgments, identities or dependency pins.
4. Fetch/rebase before the first push; regenerate the supported source lock last. Run source integrity, release metadata validation through the pinned release source/listing readers, structural first-party checks and typecheck. No full local verification or browser work for metadata-only changes.
5. Make a fleet-authored commit with the cleanup hook active. Audit all candidate identities, trailers and messages; push only cloud/sd-uptime-release-0-5-17 through the fleet guard. The Mac lander owns the publication scan and landing.
6. Discover and poll exact-SHA Verify through REST within the ten-call budget, no faster than 300 seconds per run. Publish actual reports/receipts on the separate evidence ref, report terminal product custody, then delete the successful clone. Create no tag or GitHub Release and submit no landing request.

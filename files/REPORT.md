# Uptime import, monitor erasure and member controls

Task: main-uptime-erase-in-place-1-c1
Repository: just-every/run-uptime
Product branch: cloud/main-uptime-erase-in-place-1-c1

## Plan and scope

1. Refresh the launcher, install bundle-only Git authentication and fleet commit/push guards, and clone Uptime with full history.
2. Start at current origin/main; squash cloud/main-uptime-erase-in-place-1; preserve main's newer tests and contract documents. Add the member-control fix in the same single product commit, with no merge commit.
3. Reproduce the recovery-code failure through the emitted application, preserve show-once credentials and heartbeat redaction, and retain the import file and typed erasure confirmation through native second-factor verification.
4. Run the existing access matrix, operator-security journey, typecheck, and related import, erasure and signed-heartbeat journeys. Show the changed screens at 1440 and 390, with journey assertions at 1440. Add no test registration or weaker assertion.
5. Fetch main, restore the three contract documents from main, regenerate the source lock last and check it. Inspect every candidate identity and trailer, commit once, and use the fleet push guard on the named branch.
6. Watch exact-SHA Verify through REST, at least 300 seconds between observations of a run and within ten calls. Publish this report and the actual non-secret receipts only to the separate evidence branch. The fleet owns publication scanning and landing. Delete the product clone only after product and evidence publication succeed.

## Diagnosis and product changes

The failing selector still exists at `#access-member-controls #security-controls [data-secret-once] pre`. Neither heartbeat redaction nor the import/erase round moved or hid that element. There was a startup race in the existing security-controls action guard: `run()` set `busy` while loading factor state, overview and keys, then discarded any action while `busy`. The factor-state label and recovery button were usable before those background reads finished. An early click therefore made no recovery-rotation request, leaving no secret to display. The ordinary combined-head access matrix passed here, confirming that the reported timeout was timing-dependent.

A separate, uncommitted browser diagnostic held the real startup `GET /api/credentials` response, clicked Replace recovery codes once and released the response. Before the fix it deterministically observed zero rotation requests and no shown secret. After the fix the same single click completed one real rotation and displayed the recovery codes; saving cleared them. The diagnostic uses public HTTP and native auth, with response gating rather than sleeps, retries or increased timeouts. It is retained only in this evidence packet, not as a product test.

The product fix makes user actions await the initialization promise before acquiring the mutation guard. Startup reads no longer consume that guard. Existing action serialization, real server authority checks, one-time code display and clearing remain in place. No test locator or assertion changed. The race was already present in the shared security-controls code; the integration exposed it. There is no demonstrated direct causal dependency on heartbeat redaction, which remains intact.

The squashed round also retains:

- Import Preview: fresh-factor refusals open the in-place prompt, cancellation retains the selected file, and successful verification retries the same upload bytes without applying the file.
- Monitor erasure: the in-place prompt retains the typed monitor name, resumes the same request once and displays the committed receipt before returning to the monitor list.
- Receipt: entity kind, receipt ID, completion time and one affected count per returned table; the displayed receipt matches durable storage and later archive content.

No five-minute rule, erasure scope, contract judgment or unrelated legacy prose changes.

## Counts and contract custody

Before and after: 47 registered push journeys; zero new registrations in this correction. The carried monitor helper remains within the previous round's operator-security journey. Contract totals remain 37 done, 58 partial, 20 missing, 115 total. IMPORT-001 stays partial; ERASURE-001 stays done; ACCESS-003 stays partial. No clause status change and no new DONE claim.

CONTRACT.md, ACCEPTANCE.md and docs/CLAIMS.md are byte-identical to origin/main. CONTRACT.md's Status, Gap and Evidence are unchanged. The contract generator check passed with zero errors or warnings. Source lock is regenerated last and checked; exact commit and document hashes are recorded in PRODUCT_RECEIPT.json.

## Evidence and limitations

LOCAL_CHECKS.json records actual commands, exit codes, runtimes and durations. CI_RECEIPT.json records exact-SHA REST observations and call times. BROWSER_RECEIPT.json binds the reviewed screenshots to the product head. The packet includes the complete selected non-secret logs, receipt data and browser proof. No credentials, factor codes, environment dumps, private settings, held-out gate material or symlinks are selected.

The supplemental definitions-import journey failed locally on its existing oversized-file refusal at tests/definitions-import.mjs:84: native fetch raised ECONNRESET while writing the request, before the assertion could inspect an HTTP response. This happened under Node 22.20.0 and 24.19.0; both actual failed results are retained. No assertion, timeout, retry, production limit or server behavior was changed to hide this transport result. The separate operator-security browser journey proves the touched Preview flow with retained bytes and no writes. Exact-SHA Verify remains the full CI bar.

The prior round's last.txt was not shipped, but its public report-only evidence ref was already present in the full clone. PREVIOUS_ROUND_REPORT.md and PREVIOUS_ROUND_PROVENANCE.json retain that report and bind it to the stated previous product head. The three claim lines below are carried exactly from that report and still hold on this head. ACCESS-003 point 2 is supported by the completed proveMfaPolicy and proveImportEraseStepUp journeys; no DONE claim or contract judgment changes.

CLAIM IMPORT-001 PARTIAL points=none tests=tests/monitor-stepup-support.mjs#proveImportEraseStepUp
CLAIM ERASURE-001 PARTIAL points=none tests=tests/monitor-stepup-support.mjs#proveImportEraseStepUp
CLAIM ACCESS-003 PARTIAL points=2 tests=tests/mfa-policy-support.mjs#proveMfaPolicy; tests/monitor-stepup-support.mjs#proveImportEraseStepUp
DEFAULT ACCESS-003: Retain the existing five-minute server step-up policy, native authority checks and once-only retry of the unchanged request.
GAP IMPORT-001: This correction claims the Preview subset; full import acceptance is not newly qualified by the browser proof, and the supplemental local oversized-upload transport failure is reported separately.
GAP ACCESS-003: No new provider-MFA or whole-clause qualification is claimed.

Publication scanning and landing belong to the Mac fleet as specified by the cloud adaptation. This cloud run neither pushes main nor claims landing or release acceptance. No PR is required by the repository's contributor rules; the fleet receives the branch.

## Terminal provenance

Final product SHA, parent, one-commit ancestry, push receipt, exact-SHA Verify run IDs and conclusions, and evidence publication are recorded in the accompanying receipts and the final task message.

## Completed local results

The Node 22.20.0 access matrix, operator-security journey, erasure-audit journey, signed-runner journey and TypeScript checks all passed. The signed-runner journey retained the heartbeat redaction assertions from main. The edition source-lock check and contract-document check passed. The supplemental native-fetch import failure above remains honestly recorded.

On the exact pushed head, the member-control probe observed one rotation for one early click and cleared the shown codes after saving. The import/erasure browser journey passed with screenshots at 1440 and 390. All ten selected screenshots were visually reviewed. The receipt's 42 per-table counts matched both storage and later archive data. No recovery code or credential is visible in the selected images. An initial inline Node launcher stalled before browser creation; its own process IDs were stopped, its scratch removed, and the ordinary file-based launcher completed the unchanged journey.

Product: b195ca95cfdf274c3e74745e6698e85d1042af99, one ordinary commit directly atop a715d2188b5d38cc563465292bc8c461b93c6528. First-attempt fleet-guard push succeeded. Verify run: 43168023807 (exact-SHA status in CI_RECEIPT.json).

The repository-required spec generation and spec check also completed successfully against the candidate build, with no tracked-byte changes. SPEC_RECEIPT.json and the complete spec logs retain this result.

CI call 3 at 06:35:26 UTC returned a gh transport/parser error (`invalid character 'u' looking for beginning of value`), with no workflow result or HTTP status supplied. The failure is retained in CI_RECEIPT.json and CI_TRANSPORT_RECEIPT.json. The launcher was refreshed, complete fleet Git setup repeated, and the watcher resumed with the same injected credential source and polling interval. This error is not a failed workflow conclusion.

## Final result

Verify 43168023807 completed/success on exactly b195ca95cfdf274c3e74745e6698e85d1042af99, observed at 06:40:26 UTC. Four GitHub API calls were used; every observation was at least 300 seconds after its predecessor. The one transport failure recovered after the launcher refresh. No result from another SHA is used. No workflow failed on this candidate.

Product blockers: none. The supplemental local oversized-upload native-fetch ECONNRESET remains recorded; the exact-SHA full Verify succeeded. The one-commit product branch is pushed, with unchanged contract documents and counts, no PR, no default-branch write and no landing claim. This complete packet is published separately to refs/heads/evidence/main-uptime-erase-in-place-1-c1. The pushed, clean product clone is removed after successful evidence publication and remote-head readback; the actual packet is retained outside it.

READY branch=cloud/main-uptime-erase-in-place-1-c1 head=b195ca95cfdf274c3e74745e6698e85d1042af99

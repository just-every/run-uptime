# Uptime scheduled Verify investigation

Builder: Codex, 2026-11-19.

The scheduled Verify run [44475744343](https://github.com/just-every/run-uptime/actions/runs/44475744343) failed on main at `373dfff5fbbefd13d13d6c0598401393938118da`. Main still advertised that commit when checked during reproduction.

| Job | Job ID | Failing step | Step duration |
| --- | --- | --- | ---: |
| shards (push-5) | 135396067308 | Run this shard | 362 s |
| shards (push-8) | 135396067333 | Run this shard | 851 s |
| verify | 135404095192 | Require the selected coverage and its proof | — |

The plan, shared build, contract-docs, and six other nightly shards passed. The aggregate job requires the selected shards to pass.

## Plan and evidence

1. Read the failed job steps and retrieve the failed assertions from the workflow archive. The three per-job archive requests and the run-level request exited 0 with empty output. The shard check annotations recorded generic exit code 1. The retained browser artifact download returned HTTP 403 Forbidden from the artifact store.
2. Reproduce the two failed steps with the same nightly shard allocation at the original SHA. Build once, bind the artifacts to the source with the workflow's shared build code, and use Node 22.20.0, pnpm 10.12.4, canonical per-shard temporary directories, and the cloud system Chromium.
3. Use the reproduced failure to isolate a minimal fix. Run the affected journeys and typecheck, check contract and source-lock output, and scan the exact candidate in a fresh full-history checkout before publication. Require Verify for the exact published SHA.

## Findings and changes

The full archive retrieved with GitHub CLI 2.83.1 identified two failed assertions. The original nightly shard commands both passed on the first local attempt. Slowing the relevant network response in each fixture reproduced both original assertions with exit 1. With the changes applied, both focused journeys exited 0 under the same conditions.

- The operator-security journey checked passkey visibility immediately after the code field appeared. The page fetches second-factor status asynchronously and reveals the passkey option afterward. A temporary five-second delay on that fetch reproduced the failed snapshot check. The test now waits for the passkey option to become visible and still checks that the code field receives focus.
- The redirect-cycle journey compared receiver wall times with signed timestamps that the runner aligns to the Worker's clock. A 250 ms delay after the Worker's claim response was captured reproduced that assertion. The fixture now measures order between releasing the claim and receiving the signed submission on the control bridge's clock. It also requires the observed receiver span to fit within the signed duration and checks that the duration matches the signed start and end. The committed fixture retains the asymmetric claim delay. Redirect ordering, hop exhaustion, TLS verification, durable evidence, quiescence across restart and recovery remain covered.
- The two test source hashes were regenerated in `sources.lock.json`. The contract generator write and check and the source-lock check passed. The change adds or removes zero verification journeys and changes zero clause judgments.

| Count | Before | After |
| --- | ---: | ---: |
| Verify journey commands | 47 | 47 |
| Contract clauses done | 37 | 37 |
| Contract clauses partial | 58 | 58 |
| Contract clauses missing | 20 | 20 |

## Candidate

`cloud/gr-mt-uptime-ci-5` at `73e94712bb02c557ad067fc8df75b0cd2b1838c4`.

The exact candidate passed `node tests/operator-security.mjs`, `node tests/tls-auth.mjs`, and `pnpm run typecheck`. In the redirect journey, six ordered requests and six verified TLS connections preceded the signed redirect failure. The failure ended in 48 ms against the saved 3000 ms timeout, then stayed quiet across the two timeout windows and Worker restart before the next ordinary recovery slot.

Base's publication scanner reached its default deadline on the first fresh clone. The bounded retry on a second fresh full-history clone completed with PASS and zero new findings against the declared public main. The cloud push guard published the candidate on its first attempt, and Git read back the exact SHA from the named branch.

The ten GitHub diagnostic calls were used to recover the original failed assertions. Exact candidate Verify remains unconfirmed. The report captures the published candidate for the fleet's independent checks.

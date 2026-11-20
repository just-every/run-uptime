# Uptime rer 0.2.125 adoption

Task sd-uptime-rer-pin-125-1 · Run Edit Run fleet · 2026-11-20 UTC

No contract clause claimed; this is a rer adoption.

## Plan carried out

1. Start from the public Uptime main branch in a full-history blobless clone. Review the last pin change and the previous Base refresh for the lockfile and copy-record shape.
2. Install the exact npm pin with pnpm and check the resulting frozen lock. Check out the full Base commit in a separate blobless clone and refresh the recorded copies from that checkout.
3. Run typecheck, setup, build, generated deployment-spec checks, Uptime archive restore and operator-auth journeys, and Base owner-migration tests. Fix incompatibilities inside Uptime's local transfer and MFA call sites.
4. Regenerate and check the contract views, restore the tracked view copies from main, and regenerate and check the source lock last. Keep the product candidate to one commit.
5. Run the publication checks, fetch and rebase against current main, audit commit identities and trailers, and publish the named branch with the fleet push guard. Check its Verify run on the exact product SHA and return this packet on the evidence ref.

## Changes

- Uptime now pins rer 0.2.125 in the package manifest and pnpm lockfile. The repo tracks the pnpm lockfile. The preceding rer pin was 0.2.121 from commit 0388aeb.
- The Base tag object ed28be13eb6fc1155d2b889410d044271966c2fa peels to 965e8d4e105f6f4d281dacb3c099f6a958a886e7. The refresh updated the recorded Base source from f2737d02a5f77be042cfdfd237a7dce4689cbe2f. The generated Base copy files were retained as written. The refresh reported a seed-owned Verify workflow and preserved it.
- The Uptime CLI transfer used an internal helper removed by the new package. It now reads the destination migration ledger and passes that ledger and the authenticated archive's recorded migration digests to the updated compatibility checks before transfer state is initialized.
- The new rer local browser probe requires a usable 2xx destination. After local dev handoff, the existing actionable owner MFA challenge responds with HTTP 200 for document reads. The private APIs continue to require enrolled-factor proof. The test assertions and the native, email sign-in challenge behavior were preserved.

## Counts

| Inventory | Before | After |
| --- | ---: | ---: |
| Core clauses, done / partial / missing | 37 / 47 / 11 | 37 / 47 / 11 |
| Agent surface clauses, done / partial / missing | 0 / 11 / 8 | 0 / 11 / 8 |
| Later clauses, done / partial / missing | 0 / 0 / 1 | 0 / 0 / 1 |
| Full target clauses, done / partial / missing | 37 / 58 / 20 | 37 / 58 / 20 |
| Recorded Base copy groups | 123 | 123 |
| Uptime SQL migrations | 91 | 91 |
| Verify journey commands / push shards | 47 / 8 | 47 / 8 |

Clause status changes: none. The generator wrote zero documents, and the policy source and both generated views match main.

## Local and publication results

- The exact pin installed with the frozen pnpm lockfile. Typecheck, setup, build, deployment-spec generation and freshness, rer first-party check, offline Base-copy verification, contract-view check, and source-lock check passed.
- The archive Verify shard passed, including restart after interrupted export and import. It restored 120 monitors inactive, preserved scheduled observations, and rejected corrupt, foreign and changed-file input without writing product records. The pinned rer verification also passed its hydration and agent-door checks.
- Uptime's full command journey exported through rer, reset the local state, established a separate receiving owner, imported and re-exported. The rebuilt Worker verified exact history and inactive definitions, destinations and outbound jobs. The separate built-Worker recovery journey restored through its own fresh Wrangler persistence directory.
- Uptime's import command uses the checkout's local state, and Wrangler accepts the persistence directory flag. The local runtime applied all 91 Uptime migrations with a native TIMESTAMP ledger. Uptime declares no extra owner migration directory. The released Base checkout passed its own local owner-migration round trip and Worker interleaved-history test, including refusal of changed, missing and reordered owner ledger entries.
- Operator-security, hosted sign-in and mail-off journeys passed. The command journey reached the local MFA challenge and verified that an unproved handoff received a 403 from the private session API. The refreshed signed-out local key gate was captured at 1440 and 390 pixels.
- Base publication scan completed on the exact product commit with zero findings and zero warnings. The first scan attempt on the intermediate commit hit the default deadline. The final scan began before branch publication and completed afterward.
- The pre-push fetch and rebase found current main. One linear commit was pushed on the named cloud branch. The branch ref was read back at the exact candidate SHA.

## Exact-SHA Verify

Branch `cloud/sd-uptime-rer-pin-125-1` points to `6d0951f0024bbf7f9df055cc70e68a2c76c3d38c`. Verify run `44769647428` reported **success** on that SHA at 2026-11-20T16:21:32Z. [GitHub Actions](https://github.com/just-every/run-uptime/actions/runs/44769647428)

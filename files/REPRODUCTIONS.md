# Actual regression reproductions

All stamps use UTC. Source work was applied as a net diff from prior branch head `67752d3d186946e643ca58a833c171dcb86cce2e` onto main `395b92f1c37ab3ff166a18112643b18a31b5339e`.

## IMPORT-001 native Playwright preview

Before repairing withholding, `node tests/definitions-import.mjs` reached the added production-door regression and failed at its counts assertion:

```
Entry 1 (“Native Playwright preview”): Step 1 has an unknown step kind “[withheld]”; a flow step is one of goto, click, fill, waitFor, expect
actual:   { create: 0, unchanged: 0, change: 0, refused: 1, unsupported: 0 }
expected: { create: 1, unchanged: 0, change: 0, refused: 0, unsupported: 0 }
```

The regression translates a Playwright suite using the real translator, sends its native monitor document through authenticated production recognition/upload/plan/preview, checks the accepted count and step count, and reads recognition's returned document to compare the steps, runner-local credential reference and immutable source files. It explicitly cancels the unused preview before later whole-custody assertions.

## Local verification observations

An initial command-journey launch under the VM's Node 24 failed its doctor check before reaching the assigned assertion; the checkout pins Node 22.20.0. All authoritative subsequent local checks use the installed pinned Node 22.20.0.

Early import attempts encountered a loopback ECONNRESET and a background notification fingerprint migration during an all-table snapshot. A first version of the added preview test also left a pending custody plan that a subsequent refused-preview cleanup removed. The final test cancels that plan explicitly. These observations are retained separately from the assigned regressions; no existing refusal or batch-count assertion was weakened.

## INTERFACE-001 command journey batch count

The full baseline command journey completed the field report screen, exported its product archive, reset and prepared a receiving installation, imported the archive, then failed the unchanged assertion at `tests/command-journey.mjs:255`:

```
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
5 !== 4
actual: 5
expected: 4
```

The extra batch belongs to the added incumbent report screen. Its Undo intentionally retains import history, so undoing that batch cannot restore the shared journey's original batch inventory. The repair keeps this screen in a separate migrated Worker installation and browser context; the command journey still calls it and the original four-batch assertion and expected batch identities are untouched.

## Withholding counterproof retained

Restricting source-step withholding only by a script/recording type was insufficient: the complete capture journey found a retained synthetic secret sentinel in type-less transaction performance steps. The final repair retains withholding for every non-native step payload and preserves steps only when traversing the `flow` member of a monitor whose type is `flow`. The existing whole-custody sentinel assertion remains intact.

## Local transport boundary

The cloud runtime intermittently resets an HTTP connection when its oversized request stream is rejected before all client bytes finish writing. Disabling fetch pooling alone did not fix it. A cloud-only standard Node HTTP client, outside the repository, uses bounded body writes and reads the actual server status, headers and response body. It never retries, invents a response, alters a payload or changes an assertion. The exact harness is included in the packet as `local-http.mjs`; GitHub Verify uses the repository's unchanged clients.

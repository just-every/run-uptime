# Published RER adoption

This checkout pins the unmodified published `@runeditrun/rer` package exactly to
`0.2.6`. Its registry SHA-512 is recorded in `pnpm-lock.yaml`. No package patch
or external Base checkout is needed at runtime.

`modules/demo` requires operator-auth's shared CSP helper. The app's
operator-auth runtime copy remains at immutable Base revision
`a6afad9f4d007bf1b97a75bd67880d1850683e5d`, as the SC-05 source contract
requires; historical SQL migration bytes remain intact. The old foundation
comparison baseline is retained in the edition source lock.

The app-side demo module retains the a6 source at `src/modules/demo`, with an
explicit `edition.json` mapping to Base's `modules/demo` comparison baseline.
Its `index.mjs` adapts only the two relative operator-auth imports to
`../../base/modules/operator-auth/http.mjs` and
`../../base/modules/operator-auth/csp.mjs`. The guard behavior is unchanged.
The five other files have individual byte-equality records in `base-copies.json`;
the adapted index is covered by the edition mapping and source lock, not claimed
as a verbatim copy. Operator-auth remains unchanged at its a6 runtime pin.


The credential-free `rer deploy --demo --dry-run` prepares the front Worker,
configuration and workerd image locally. Docker execution and hosted acceptance
require separate evidence.

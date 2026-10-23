A browser monitor checks a specific customer journey and every required outcome. Choose Chromium, Firefox or WebKit, then a desktop or mobile profile. Use separate monitors for each combination you need: a desktop success never clears a mobile checkout failure.

## Create a journey

Open **Archive → Monitor files** at `/app/archive`, paste a definition file, preview it and apply the reviewed plan. New monitors start paused. A flow contains fixed steps and required outcomes, not executable JavaScript. For example:

```json
{
  "format": "uptime.monitors",
  "version": 5,
  "monitors": [{
    "name": "Checkout — WebKit mobile",
    "type": "flow",
    "url": "https://shop.example.com/checkout",
    "intervalMs": 300000,
    "timeoutMs": 60000,
    "probes": ["local-a", "local-b"],
    "flow": {
      "browser": "webkit",
      "device": "mobile",
      "intent": "Confirm that sandbox checkout reaches its confirmation",
      "steps": [
        {"kind": "goto", "url": "https://shop.example.com/checkout"},
        {"kind": "click", "target": {"role": "button", "name": "Confirm sandbox order"}}
      ],
      "outcomes": [
        {"id": "order-confirmed", "what": "text", "value": "Sandbox order confirmed"}
      ]
    }
  }]
}
```

Use an authorized sandbox and synthetic accounts. Two independent runner networks, or one network with an independently passing external check, are required to confirm public failures. An imported file carries neither runner authority nor credentials. Review its local runner assignment and explicitly authorize and resume it.

`browser` accepts `chromium`, `firefox` or `webkit`. `device` accepts `desktop` (1280 × 800, scale 1) or `mobile` (390 × 844, scale 3, touch). Mobile uses the chosen browser engine, not a native iOS or Android device. Firefox uses its supported viewport and touch emulation; Chromium and WebKit additionally enable their mobile layout mode. The browser's native User-Agent is retained. Definitions written before profiles were introduced mean Chromium desktop.

The monitor’s **Browser flow** panel shows the current combination and lets you save another one as a new immutable revision. The earlier results keep their original combination. Changing it during an incident is labelled a changed definition: a pass on the replacement profile does not establish recovery of the original profile. To cover several combinations continuously, clone the monitor in the catalog and give each clone a distinct name and profile. The installation limit is five browser monitors, including paused ones.

## Install and supervise engines

From the installed checkout on every assigned runner machine:

```sh
pnpm exec playwright install chromium firefox webkit
```

Restart the private runner after installing or removing an engine. It tests each engine at enrollment and reports the available engines in `GET /api/runners`. A missing, disabled or failed selected engine produces Unknown with that engine’s name; it never substitutes another browser. `UPTIME_RUNNER_BROWSER=off` disables all flows. Set `UPTIME_RUNNER_BROWSERS=chromium,firefox` to permit only those engines on a particular runner. The default permits all three. Keep the runner’s ordinary signed-in operating-system HOME; browser profiles and temporary files remain separate per-run directories.

Credentials used by a `fill` step stay in protected runner-local files bound to the exact monitor ID and origin. A clone has a new ID and needs its own credential reference and file. See [runner credential custody](/docs/runner#request-secrets-stay-with-the-runner).

## Evidence and safety

Every completed browser attempt records its selected browser, device and viewport with its immutable flow digest and sanitized step trace. Selected network vantages check the same combination; they are never used to mix several engines into one health verdict. Missing coverage remains Unknown.

All engines use the same authenticated filtering proxy for navigations, redirects, subresources and WebSockets. It validates destinations, pins connections and enforces byte and traffic limits. Service workers and downloads are disabled. Direct WebRTC and WebTransport page APIs are disabled, Firefox also disables peer connections and speculative networking, and Chromium disables direct UDP paths. Credentials remain restricted to their exact origin. Run each runner with the independent network isolation described in the runner instructions; a signed result identifies its key holder rather than proving an uncompromised host.

**Recent checks** and **Revision history** name the combination each attempt used. Period reports retain separate browser/device revision segments, each with its own coverage, Unknown time and latency. Whole-period totals are explicitly across revisions. JSON, CSV and PDF retain the segments. Product archives retain these definitions and traces and restore the monitors paused; they never carry browser profiles, session cookies or runner credentials.


## Login, signup and sandbox checkout

Use a dedicated synthetic account on an explicitly authorized test service. A login journey opens the sign-in page, fills runner-local credential references, submits the form and requires the signed-in outcome. A successful response from the login page alone is insufficient. For example, put this `flow` in a browser monitor definition whose URL is your sign-in page:

```json
{
  "intent": "Sign in and see the account dashboard",
  "steps": [
    {"kind": "goto", "url": "https://sandbox.example.com/login"},
    {"kind": "fill", "target": {"label": "Email"}, "credentialRef": "synthetic-email"},
    {"kind": "fill", "target": {"label": "Password"}, "credentialRef": "synthetic-password"},
    {"kind": "click", "target": {"role": "button", "name": "Sign in"}},
    {"kind": "waitFor", "what": "text", "value": "Welcome back"}
  ],
  "outcomes": [{"id": "signed-in", "what": "text", "value": "Welcome back"}]
}
```

For signup, use your sandbox's account-creation URL and submit button, and require the account-created confirmation. Repeated scheduled signup needs an authorized reusable sandbox identity or reset policy; Uptime does not generate disposable identities or clean up accounts automatically. Never point a signup monitor at an ordinary customer's account.

For checkout, continue the signed-in steps with the sandbox order button and require the final order confirmation, rather than merely the checkout form. Use test-mode payments and sandbox inventory only. Each required outcome is checked after the final step. A flow may add `fixtures`: `setup` steps that create a synthetic account or a Stripe test-mode order before the first page, and `teardown` steps that delete or cancel them afterwards, written as API transaction steps on the flow's origin. Teardown runs whatever happened to the browser, including a cancelled run; values it extracts stay on the runner. A teardown that cannot finish becomes cleanup debt; it never changes the browser's verdict. Live purchases need an exact, expiring grant with a spend limit.

## Read a failed journey

Open its monitor, expand **Recent checks**, and read the failed step and every required outcome. Wrong credentials retain an unmet sign-in expectation. A removed button is an element failure; an HTTP error page records its status; missing confirmation is a required-outcome failure; a page that keeps loading records a navigation timeout instead of claiming that its clicked button was missing; the overall run deadline is a named time-limit failure. Private redirects, metadata subresources and an undeclared origin are blocked. Missing browser or credential capacity is a runner error and coverage is Unknown, never a successful transaction.

Fix the controlled application and wait for fresh scheduled passing evidence from the saved profile and assigned probes. **Run now** gives manual evidence without advancing scheduled recovery. Removing or changing a required outcome creates a new immutable revision and a changed-definition recovery label; it never proves that the original customer outcome recovered. The local qualification suite exercises login, signup and sandbox submission through two isolated runner processes; independent geographic placement and hosted execution require their own acceptance.


## Retained browser failure artifacts

Enable **Capture redacted failure screenshots and browser artifacts** under the monitor’s **Failure snapshots → Retention and redaction**. Failed attempts can retain a 1000 × 700 redacted screenshot, a WebM replay of redacted step frames, a sanitized native trace ZIP, up to 60 request timings and 20 console errors or warnings. The replay omits activity between frames. Native traces retain action and timing metadata; DOM snapshots, network bodies and headers, credentials and source files are omitted. Literal masks and known runner credentials are removed before capture; URL queries and fragments are excluded from the waterfall.

Open **Incident evidence → Load incident failure snapshots**, or the monitor’s **Failure snapshots**. The snapshot names its immutable observation, slot, revision and flow digest, and shows signed step durations alongside screenshot, video controls, trace download, waterfall and console messages. Each unavailable artifact has a separate capture reason. A failed capture never changes a failed check into a success or changes availability. Artifacts are available only to the owner and members explicitly granted this monitor’s evidence access; revoking access blocks subsequent reads.

Each snapshot is bounded to 384 KiB including encoded artifacts; decoded PNG, WebM and ZIP limits are 64, 128 and 64 KiB respectively. Exceeding a capture bound produces an explicit unavailable artifact. Opaque bytes use installation-bound authenticated encryption at rest. Existing snapshot retention, complete bounded incident reports, portable archives and monitor erasure apply to every artifact. Archive export decrypts safe artifacts for portability and independent-installation restore encrypts them under the receiving installation key; archives therefore require the same care as other retained evidence.

Changing literal masks or safe-value controls discards previously captured screenshots, videos and traces because those bytes cannot be safely masked again. Disabling capture removes retained opaque artifacts and fences in-flight captures. In-flight captures from an older policy cannot repopulate artifacts after a policy change. Existing textual evidence is scrubbed with current masks; longer retention never restores expired artifacts.

## Import a supported Playwright suite

`node scripts/definitions.mjs import-playwright --input suite.spec.ts --fixtures fixtures.json --lock package-lock.json --output uptime.monitors.json` reads a real TypeScript/JavaScript Playwright test file as syntax. It never imports or executes that file. Preview the resulting ordinary monitor file with `node scripts/definitions.mjs preview --input uptime.monitors.json --json`, review its outcomes, and deploy exactly that preview with `node scripts/definitions.mjs apply --input uptime.monitors.json --digest DIGEST`. `--base api-checks.json` includes existing API definitions in the same reviewed deployment. Imports arrive paused; review assignments, bind selected runner-local secrets to each new monitor ID, then resume explicitly.

The supported subset imports `{test, expect}` from `@playwright/test` and `fixtures` from `./fixtures.json`; each literal-named `test` has an `async ({page})` callback. It supports `page.goto`, `getByLabel`, `getByText`, `getByRole` with a name, CSS `locator`, `click`, and `fill(process.env.NAME!)`, where `fixtures.json` selects `credentialRefs: {"NAME": "runner-reference"}` without containing the secret value. Imported locators retain Playwright strict matching: ambiguous controls fail instead of selecting the first match. Awaited `expect(locator).toBeVisible()` and `expect(page).toHaveURL('/path')` remain required at their authored steps. Each test must start with a navigation and end with an expectation, which is also its final required outcome. No literal fill secret, custom fixture code, hooks, loops, expressions, arbitrary imports, direct network calls or browser evaluation is executed: unsupported syntax is refused with its file, line and reason. Nothing is emitted on refusal.

The JSON fixture may contain data fields, a `network` selection and `flowFixtures` containing the existing closed setup/teardown vocabulary described above. Each input file is limited to 64 KiB and a suite to the installation’s five-flow bound. The npm v3 dependency lock is retained as metadata; dependencies are never installed by this import. Fixture and lock URLs cannot carry userinfo, queries or fragments, and credential fields are refused. The three source files travel in ordinary immutable flow revisions and their signed content digest. Read `/api/monitors/ID/revisions` to review the exact source bytes and translated required outcomes; definition export retains them. Ordinary monitor erasure removes this source custody with the monitor and its dependent import history. No new durable category is introduced.

`.github/workflows/import-playwright.yml` supplies the same three CLI commands for an owner-controlled self-hosted installation runner labelled `uptime-installation`, with its checkout directory in the `UPTIME_CHECKOUT` repository variable. Stop local dev/preview before the job, as for any definitions deployment. The workflow makes no GitHub API call and receives no provider secret. The current push journey proves the import command plus preview/deploy through the ordinary Worker door, not a hosted GitHub run or the workflow's preview/apply CLI invocations.

FLOW-002 remains partial. Executing arbitrary Playwright code needs an OS-level sandbox; a Node process alone cannot prevent direct sockets bypassing the filtering proxy. The console import-source preview/revision view and the complete workflow command journey are not yet proven. The existing flow journey retains distinct broken setup, assertion and forbidden metadata outcomes, and ambiguous imported locators fail.

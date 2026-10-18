A browser monitor checks a specific customer journey and every required outcome. Choose Chromium, Firefox or WebKit, then a desktop or mobile profile. Use separate monitors for each combination you need: a desktop success never clears a mobile checkout failure.

## Create a journey

Open **Definitions**, paste a definition file, preview it and apply the reviewed plan. New monitors start paused. A flow contains fixed steps and required outcomes, not executable JavaScript. For example:

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

Restart the private runner after installing or removing an engine. It tests each engine at enrollment and shows the available engines in **Runner / archive**. A missing, disabled or failed selected engine produces Unknown with that engine’s name; it never substitutes another browser. `UPTIME_RUNNER_BROWSER=off` disables all flows. Set `UPTIME_RUNNER_BROWSERS=chromium,firefox` to permit only those engines on a particular runner. The default permits all three. Keep the runner’s ordinary signed-in operating-system HOME; browser profiles and temporary files remain separate per-run directories.

Credentials used by a `fill` step stay in protected runner-local files bound to the exact monitor ID and origin. A clone has a new ID and needs its own credential reference and file. See [runner credential custody](/docs/runner#request-secrets-stay-with-the-runner).

## Evidence and safety

Every completed browser attempt records its selected browser, device and viewport with its immutable flow digest and sanitized step trace. Selected network vantages check the same combination; they are never used to mix several engines into one health verdict. Missing coverage remains Unknown.

All engines use the same authenticated filtering proxy for navigations, redirects, subresources and WebSockets. It validates destinations, pins connections and enforces byte and traffic limits. Service workers and downloads are disabled. Direct WebRTC and WebTransport page APIs are disabled, Firefox also disables peer connections and speculative networking, and Chromium disables direct UDP paths. Credentials remain restricted to their exact origin. Run each runner with the independent network isolation described in the runner instructions; a signed result identifies its key holder rather than proving an uncompromised host.

**Recent checks** and **Revision history** name the combination each attempt used. Period reports retain separate browser/device revision segments, each with its own coverage, Unknown time and latency. Whole-period totals are explicitly across revisions. JSON, CSV and PDF retain the segments. Product archives retain these definitions and traces and restore the monitors paused; they never carry browser profiles, session cookies or runner credentials.

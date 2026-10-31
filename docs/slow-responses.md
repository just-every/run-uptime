Slow-response notices tell you when completed checks are taking too long. A confirmed **Slow** event has its own recipients and recovery notice. It does not open an outage incident, count as downtime, or reduce uptime or SLA figures.

An HTTP latency assertion serves a different purpose: a response over that assertion’s limit fails the check and can contribute to an outage. If you want a Slow notice for a response, that response must still pass the check’s assertions.

## Set a slow-response policy

Open a monitor and find **Slow-response notices** beside **Alert recipients**. Choose **Edit slow-response policy**, then **Enable slow-response notices**.

1. Enter a response-time threshold in whole milliseconds, from 1 to 600,000, below the monitor’s saved timeout. A response that times out is not a passing response and cannot confirm Slow.
2. Choose an evaluation mode and a window of 1–100 scheduled slots. A slot is one scheduled check time; retries do not add slots.
3. Choose all configured locations or select a nonempty subset.
4. Inherit the monitor’s alert route, or choose local destinations and their contact schedules.
5. Choose **Save slow-response policy**.

The policy is available for HTTP, keyword, TCP, DNS, TLS, domain and browser-flow monitors. Heartbeat jobs use their own receipt and run-duration rules.

Saving creates a monitor revision. If someone changes the monitor while the dialog is open, saving is refused; close and reopen the dialog to read the current settings. New current-revision scheduled evidence is needed after a change. Manual **Run now** checks do not confirm Slow or its recovery.

## Choose how to evaluate response time

**Consecutive slow slots** requires every slot in the selected window to contain a response above the threshold at at least one selected location. It need not be the same location in each slot. For example, a 2,000 ms threshold over three slots confirms Slow when each of those three scheduled slots contains a passing response above 2,000 ms at a selected location. Set the check timeout above the response time you want to observe.

**Percentile over a slot window** combines one response-time sample per selected location per slot. Choose p50, p95 or p99. Uptime sorts the samples and uses the nearest-rank percentile; Slow is confirmed when that value is above the threshold. A value exactly equal to the threshold does not cross it.

Every selected location needs valid passing evidence for every slot in the window. The final attempt supplies the location’s sample, so retries cannot inflate the sample count. Missing, stale, failed or skipped evidence prevents a complete evaluation. An independent external check, when present, must also pass. Missing evidence never becomes a passing response or a confirmed recovery.

## Choose contacts and schedules

**Inherit this monitor’s alert route** uses the recipients and contact schedules resolved by the monitor, service, group and installation routing policy. **Only selected destinations** gives Slow its own recipient list. Selecting no destinations deliberately leaves Slow events without a recipient.

For each selected destination, choose a delay of 0–1,440 minutes, a repeat interval of 0–1,440 minutes, an optional maximum of 1–1,000 repeats, whether to send a slow-recovered notice, and whether acknowledgement stops reminders. A delay of 0 sends immediately after confirmation; a repeat interval of 0 turns reminders off. A blank maximum allows reminders to continue while the event remains eligible. Delays start when Slow is confirmed, rather than at the first slow sample.

Disabled destinations and contacts without usable local credentials cannot receive notices. An accepted provider request does not prove inbox delivery or human receipt. Review destinations and delivery history in **Settings › Alerts**.

## Acknowledge and recover

The monitor’s Slow panel shows the latest confirmed event and its explanation. **Acknowledge Slow** records an acknowledgement and stops reminders for contacts whose schedule selects **Stop repeats on acknowledgement**. Acknowledging does not recover Slow or change monitoring health.

Recovery requires a complete, valid scheduled evaluation that no longer meets the opening event’s Slow rule. An open event keeps its opening policy and recipient schedule; editing or turning off the policy does not erase that event or manufacture recovery. A recovered event can send a slow-recovered notice to its eligible original contacts. Recovery requires an accepted original trigger, recovery enabled, and an unchanged usable recipient credential. A recovered event is not an outage recovery.

## Bring a saved response-time threshold

For **Pingdom**, the [check API](https://docs.pingdom.com/api/) supplies the response threshold. Use the existing [definition-file import](/docs/definitions) with saved HTTP check details. A positive `responsetime_threshold` maps milliseconds to a Slow policy with one consecutive slot, all configured locations and inherited recipients. A value of 0 leaves Slow off. The imported check stays paused for review; its response threshold must be below the imported request timeout. Source repeat and recovery-notice settings still need separate contact-route review.

For **Site24x7**, use a saved [threshold-profile API response](https://www.site24x7.com/help/api/#retrieve-threshold-profile). Open the Slow policy dialog and expand **Import Site24x7 threshold profile**. Paste a successful saved Website (`URL`) threshold-profile response with a static profile (`profile_type: 1`). Choose **Primary** or **Secondary** and **Trouble (2)** or **Critical (3)** explicitly. In the policy form’s **Locations** control, choose the local locations that correspond to that source scope. Selecting all maps the scope to all currently configured local locations; Uptime does not infer matching geography from external location names.

Choose **Preview imported Slow policy**. The chosen scope and severity must identify exactly one greater-than rule (`comparison_operator: 1`) using consecutive poll counts (`strategy: 1`). Its `value` becomes the millisecond threshold and `polls_check` becomes the consecutive-slot count. AI profiles, averages, time windows, percentile rules, missing or duplicate matching rules, out-of-range values and thresholds at or above the request timeout are refused.

The preview fills the editable policy fields and starts with inherited recipients. Review the local locations and contact route, then choose **Save slow-response policy**. Preview alone writes nothing. If another edit changes the monitor revision during preview or before saving, read the current settings and preview again.

The documented [Better Stack monitor fields](https://betterstack.com/docs/uptime/api/monitors-api-response-params/) describe request timeouts as failure timeouts, not a separate response-time degradation threshold. No equivalent saved Slow field is documented for the supported import mapping. Configure a local Slow policy explicitly; Uptime does not turn a request timeout into one.

## Read slow time in a period report

Choose **Generate report** on the monitor. **Slow-response time** shows confirmed Slow time and the episodes overlapping the selected period. Expand **Slow episodes in this period** to inspect confirmation and recovery times, the explanation, and each episode’s time inside the range. Imported history is labelled.

Slow time runs from confirmed Slow to independently confirmed slow recovery, clipped to the report range. An event still open at the end of the range contributes through that boundary. Missing evidence does not end an episode, so its span can include time whose availability is Unknown, paused or in maintenance. Overlapping episode spans count once in the total. The response-time location filter applies to latency samples; the Slow total retains the monitor’s confirmed events.

Availability, downtime and SLA keep their existing scheduled-evidence denominators. Slow time is shown separately and is not added to downtime. A report with no Slow episodes does not establish Healthy coverage. The report stays fixed until you generate another snapshot. Its JSON download includes the Slow total, episodes and policy; CSV for the same range includes the total, policy and episode durations.

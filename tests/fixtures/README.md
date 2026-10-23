# Synthetic fixtures

Every file here is synthetic. `uptimerobot-v3-monitors.synthetic.json` is two hand-written UptimeRobot API v3 `GET /monitors` pages saved one after the other, using the field names in UptimeRobot's published OpenAPI document (https://cdn.uptimerobot.com/api/openapi.yaml, read 12 Oct 2026). `uptimerobot-logs.synthetic.csv` imitates a log export; UptimeRobot does not publish its CSV columns, so its header is an assumption. Neither file came from a real account, and no real export has been tested.

`site24x7-monitors.synthetic.json` is a synthetic saved monitor-list response from
https://www.site24x7.com/help/api/ (read 23 October 2026), using its documented
`monitor_type` response field, monitor parameters, method and DNS lookup constants.
It contains Website, REST API, Port, Ping and DNS settings plus invalid/unsupported
records. Every name and source identifier is synthetic; no account or provider key is used.

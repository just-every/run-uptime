// Every word the landing page says, in page order. Keep it to what Uptime does today: no coverage, uptime-figure or price
// claims, and no check kinds beyond HTTP(S), keyword and heartbeat.

export const hero = {
  title: 'Sleep through the night.',
  sub: 'Uptime checks your sites and APIs on schedule, tells you only when a failure is confirmed, and never calls a missing check healthy.',
  alt: '100% free, open source alternative to',
  altNames: ['UptimeRobot', 'Pingdom', 'Better Stack'],
  primary: 'Run Uptime',
  demo: 'Try the demo',
  secondary: 'Read the docs',
  fine: 'Free and open source, MIT licensed.',
};

export const evidence = {
  eyebrow: 'Honest evidence',
  title: 'Green means it was checked.',
  body: "Every green dot is a check that actually ran and passed. When a result never arrives or expires, Uptime marks that time Unknown instead of guessing, so a quiet runner can't pass for a healthy site.",
  monitor: 'api.example.com',
  schedule: 'Every 5 minutes',
  times: ['02:45', '02:50', '02:55', '03:00', '03:05', '03:10', '03:15', '03:20', '03:25', '03:30'],
  unknownAt: '03:15',
  unknownTitle: 'Unknown',
  unknownText: 'no check received',
  label: 'Ten scheduled checks of api.example.com, every 5 minutes from 02:45 to 03:30. Every check passed except 03:15, which shows a hollow ring: Unknown, no check received.',
};

export const incidents = {
  eyebrow: 'Confirmed incidents',
  title: 'Woken only by real failures.',
  body: 'You choose how many failed checks in a row open an incident and how many passes close it. Each incident keeps the evidence that justified it: the status, timing and the rule that failed on every check.',
  checks: [
    { time: '06:45', result: '200 OK', state: 'pass' },
    { time: '06:50', result: '200 OK', state: 'pass' },
    { time: '06:55', result: '503', state: 'fail' },
    { time: '07:00', result: '503', state: 'fail' },
    { time: '07:05', result: 'missing "ok"', state: 'fail' },
    { time: '07:10', result: '200 OK', state: 'recovered' },
    { time: '07:15', result: '200 OK', state: 'recovered' },
  ] as const,
  opened: '3 failures in a row → incident opened',
  recovered: '2 passes → recovered 07:15',
  label: 'Seven checks from 06:45 to 07:15. 06:45 and 06:50 returned 200 OK. 06:55 and 07:00 returned 503 and 07:05 was missing "ok": 3 failures in a row, so an incident opened. 07:10 and 07:15 returned 200 OK: 2 passes, so it recovered at 07:15.',
};

export const checks = {
  eyebrow: 'Checks',
  title: 'Check what matters.',
  body: 'HTTP and HTTPS checks can assert on status, body text, headers, JSON values and response time. Keyword checks look for the words a page should contain, and heartbeats notice when a cron job or backup stops reporting in.',
  method: 'GET',
  url: 'https://api.example.com/health',
  assertions: ['Status is 200', 'JSON status equals "ok"', 'Responds within 800 ms'],
  heartbeat: { name: 'Nightly backup', text: 'heartbeat received 02:00' },
  label: 'A check of GET https://api.example.com/health with three passing assertions: status is 200, JSON status equals "ok", and it responds within 800 ms. Below it, the Nightly backup heartbeat was received at 02:00.',
};

export const notifications = {
  eyebrow: 'Notifications',
  title: 'Told where you already look.',
  body: 'Send incidents and recoveries by email, to a Slack incoming webhook, or to a signed JSON webhook. Every enabled destination covers every monitor in your installation.',
  email: { kind: 'Email', subject: 'Down: Checkout API', text: '3 failed checks in a row · 503 Service Unavailable' },
  chat: { kind: 'Chat', channel: '#ops', sender: 'Uptime', text: 'Recovered: Checkout API' },
  json: { kind: 'Signed JSON webhook', lines: ['{', '  "state": "recovered",', '  "title": "Recovered: Checkout API",', '  "incidentKey": "…"', '}'] },
  label: 'Three notifications for the Checkout API: an email titled Down: Checkout API after 3 failed checks in a row with 503 Service Unavailable; a chat message in #ops saying Recovered: Checkout API; and a signed JSON webhook body with state recovered.',
};

export const ownership = {
  eyebrow: 'Ownership',
  title: 'Yours, start to finish.',
  body: 'Run Uptime on your own computer. A small private runner checks your targets from a machine you choose, and you can export monitors, evidence and delivery history whenever you like.',
  commands: ['npx -y @runeditrun/rer dev just-every/run-uptime'],
  points: [
    { icon: 'cloud', text: 'Your own computer' },
    { icon: 'server', text: 'Your runner, your network' },
    { icon: 'export', text: 'Export any time' },
  ] as const,
  label: 'A terminal running one command: npx -y @runeditrun/rer dev just-every/run-uptime.',
};

export const included = {
  eyebrow: 'Also included',
  title: 'The quiet details.',
  items: [
    { icon: 'calendar', title: 'Maintenance windows', text: 'Pause alerting while you work on a service.' },
    { icon: 'play', title: 'Manual checks', text: 'Run a check now without opening or closing an incident.' },
    { icon: 'pulse', title: 'Heartbeat tokens', text: 'Each heartbeat uses its own token and increasing sequence numbers.' },
    { icon: 'pin', title: 'Pinned connections', text: 'Every DNS answer and redirect is validated, then the connection is pinned.' },
    { icon: 'seal', title: 'Signed runner results', text: 'The Worker accepts only results signed by your runner.' },
    { icon: 'restore', title: 'Safe restores', text: 'Restored monitors start paused and imported alerts never send.' },
  ] as const,
};

export const plainly = {
  title: "What it doesn't do (yet).",
  text: 'No DNS, ping, TCP or browser checks, no SMS or on-call paging, and one runner is one network vantage.',
  link: 'Read the limits',
};

export const closing = {
  title: 'Rest easy tonight.',
  sub: 'Open-source monitoring you run yourself.',
  primary: 'Run Uptime',
  secondary: 'Read the docs',
  fine: 'Free and open source, MIT licensed.',
};

// Representative pre-migration getMonitors consumer, used only at a provider edge.
const origin = process.env.UPTIMEROBOT_ORIGIN;
const response = await fetch(new URL('/v2/getMonitors', origin), {
 method: 'POST', redirect: 'manual', headers: {'content-type': 'application/x-www-form-urlencoded'},
 body: new URLSearchParams({api_key: process.env.UPTIMEROBOT_READ_TOKEN, format: 'json', monitors: process.env.UPTIMEROBOT_MONITORS, custom_uptime_ratios: '1-7-30'}),
 signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw Error('Source ratios read failed: HTTP ' + response.status);
const result = await response.json();
if (result.stat !== 'ok') throw Error('Source ratios read refused');
console.log(JSON.stringify(result.monitors.map(monitor => ({sourceMonitorId: String(monitor.id), ratios: monitor.custom_uptime_ratio.split('-').map((ratio, index) => ({horizonDays: [1, 7, 30][index], uptimePercent: Number(ratio)}))}))));

#!/usr/bin/env node
// A server-side consumer: all figures come from authenticated native reads.
import {readFile} from 'node:fs/promises';

try {
 const [flag, mapPath, ...extra] = process.argv.slice(2);
 if (flag !== '--map' || !mapPath || extra.length) throw Error('Usage: node docs/examples/uptime-ratios.mjs --map monitor-map.json');
 const origin = new URL(process.env.UPTIME_ORIGIN);
 if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
     !(origin.protocol === 'https:' || origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))
  throw Error('UPTIME_ORIGIN must be an HTTPS origin (HTTP is allowed on loopback)');
 const token = process.env.UPTIME_READ_TOKEN;
 if (!token) throw Error('Set UPTIME_READ_TOKEN to a monitoring:read key');
 const mapping = JSON.parse(await readFile(mapPath, 'utf8'));
 if (!mapping || Array.isArray(mapping) || typeof mapping !== 'object') throw Error('Supply an object mapping source monitor IDs to local monitor IDs');
 const entries = Object.entries(mapping), ids = entries.map(([, id]) => id);
 if (!entries.length || entries.length > 500 || entries.some(([source, id]) => !/^\d+$/.test(source) ||
     typeof id !== 'string' || !id || id.length > 512 || /[,\x00-\x1f\x7f]/.test(id)) || new Set(ids).size !== ids.length)
  throw Error('Map 1 to 500 distinct source monitor IDs to distinct local monitor IDs');
 const snapshots = [];
 for (const [horizonDays, period] of [[1, '24h'], [7, '7d'], [30, '30d']]) {
  const url = new URL('/api/v1/uptime', origin);
  url.search = new URLSearchParams({monitor: ids.join(','), period, timeZone: 'America/Chicago', source: 'Uptime'});
  const response = await fetch(url, {headers: {authorization: 'Bearer ' + token, accept: 'application/json'}, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw Error(`Uptime ${period} read failed: HTTP ${response.status}; no dashboard snapshot emitted`);
  const result = await response.json();
  if (result.source !== 'Uptime' || result.monitors?.length !== ids.length) throw Error('Uptime returned an incomplete native selection');
  const rows = entries.map(([sourceMonitorId, monitorId]) => {
   const row = result.monitors.find(item => item.monitor.id === monitorId);
   if (!row) throw Error('A mapped local monitor is unavailable');
   return {sourceMonitorId, monitorId, availability: row.availability, denominatorPolicy: row.denominatorPolicy};
  });
  snapshots.push({horizonDays, generatedAt: result.generatedAt, period: result.period, source: result.source, monitors: rows});
 }
 // Emit only after every read succeeds. A refusal cannot reuse an earlier result.
 console.log(JSON.stringify({snapshots}, null, 2));
} catch (error) {
 console.error('Uptime ratios: ' + (error instanceof Error ? error.message : 'read failed'));
 process.exitCode = 1;
}

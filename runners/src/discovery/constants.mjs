import {MAX_BODY} from '../../../src/domain/policy.mjs';
export const USER_AGENT='UptimeDiscovery/0.1 (+https://github.com/just-every/run-uptime; read-only GET/HEAD, honours robots.txt)';
// The product token robots.txt groups may name; "*" groups apply when none does.
export const ROBOTS_TOKEN='uptimediscovery';
export const DEFAULT_BUDGET={requests:25,concurrency:3,totalMs:60000};
// Bodies are parsed in memory and cut at these caps; nothing is kept. A home page can run past 1 MB with its footer links
// at the end, so the pasted page is read to 2 MiB; robots.txt and sitemaps need far less.
export const PARSE_BODY_CAP=2*1024*1024;
export const AUX_BODY_CAP=512*1024;
export const SPEC_BODY_CAP=4*1024*1024;
// A scheduled probe fails a GET body over MAX_BODY, so a page near that size is watched with HEAD instead. Every other
// fetch reads one byte past that limit, which is enough to know it is too large.
export const GET_BODY_MARGIN=Math.floor(MAX_BODY*3/4);
export const PEEK_BODY_CAP=MAX_BODY+1;
export const JSON_ASSERT_LIMIT=8*1024;
export const MAX_HOSTS=10;
export const MEMO_LIMIT=8;
export const MAX_NOTES=10;
export const MAX_PROPOSALS=12;
export const MAX_SELECTED=4;
export const HOP_LIMIT=4;
export const HOST_GAP_MS=150;
export const HOP_TIMEOUT_MS=8000;
export const HTML_ACCEPT='text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5';
export const INTERVAL={page:60000,'status-page':60000,health:60000,api:60000,spec:300000,subdomain:300000};

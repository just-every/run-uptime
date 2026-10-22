// DEPENDENCY-002: search the catalog and turn one followed entry into the dependency monitor definition the owner monitor
// door saves. The definition carries DEPENDENCY-001's attribution (provider as `service`, a `dependency` tag, an outcome that
// names the status as the provider's own claim) and asserts only the provider's claim: no latency assertion, because a slow
// status page says nothing about the provider.
import {MAX_BODY} from '../policy.mjs';
import {dependencyAttribution} from '../dependency-status.mjs';
import {CATALOG_REVIEWED, CATALOG_VERSION, ENTRIES} from './entries.mjs';
export {CATALOG_REVIEWED, CATALOG_VERSION, ENTRIES};
// A check reads at most this much of a source (the probe's 64 KiB body limit, less the margin discovery keeps).
export const SOURCE_READ_LIMIT = Math.floor(MAX_BODY * 3 / 4);
// Feeds are read by their newest entry, with RE2 (linear time, no lookahead): consume everything up to the first <tag>, then
// either the feed ends (nothing listed) or that first entry opens with a title that states the provider is fine.
const before = word => `(?:[^<]${[...word].map((letter, index) => `|<${word.slice(0, index)}[^${letter}]`).join('')})*`;
const quote = text => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const FEEDS = {
  'rss-newest-item': {pattern: `^${before('item>')}(?:</channel>|<item>\\s*<title>\\s*(?:<!\\[CDATA\\[\\s*)?(?:${['Service is operating normally', 'Informational message'].map(quote).join('|')}))`,
    shape: ['<rss', '</channel>'], text: 'The newest feed entry is not an impact or disruption notice.'},
  'rss-no-items': {pattern: `^${before('item>')}</channel>`, shape: ['<rss', '</channel>'], text: 'The feed lists no active event.'},
  'atom-newest-entry': {pattern: `^${before('entry>')}(?:</feed>|<entry>\\s*<title[^>]*>\\s*(?:<!\\[CDATA\\[\\s*)?RESOLVED:)`,
    shape: ['<feed', '</feed>'], text: 'The newest feed entry is resolved, or none is listed.'},
};
export const feedShape = signal => FEEDS[signal]?.shape ?? null;
export const catalogEntry = id => ENTRIES.find(entry => entry.id === id) ?? null;
export const isFollowable = entry => entry.source.kind !== 'page';
const words = text => String(text).toLowerCase().split(/[^a-z0-9.+#]+/).filter(Boolean);
// Every query word must start a word of the provider's name, alias, summary, component or region.
export function searchCatalog(query = '') {
  const wanted = words(query);
  if (!wanted.length) return [...ENTRIES];
  return ENTRIES.filter(entry => {
    const haystack = new Set([entry.name, ...entry.aliases, entry.summary, ...entry.components.flatMap(component => [component.name, component.region ?? '', component.published ?? ''])].flatMap(words));
    return wanted.every(word => [...haystack].some(candidate => candidate.startsWith(word)));
  });
}
export function publicEntry(entry) {
  const regions = [...new Set(entry.components.map(component => component.region).filter(Boolean))];
  return {id: entry.id, name: entry.name, aliases: entry.aliases, summary: entry.summary, note: entry.note ?? null, followable: isFollowable(entry),
    source: {kind: entry.source.kind, url: entry.source.url, page: entry.source.page}, whole: isFollowable(entry) && Boolean(entry.whole),
    components: entry.components.map(component => ({key: component.key, name: component.name, ...(component.region ? {region: component.region} : {})})), regions};
}
// One thing the owner follows: the whole provider or one component.
export function targetsFor(entry, selection) {
  if (!isFollowable(entry)) throw Error(`${entry.name} publishes no status Uptime can read. Add its status page by address instead.`);
  if (!selection || typeof selection !== 'object' || Array.isArray(selection) || Object.keys(selection).some(key => !['entry', 'scope', 'components'].includes(key))) throw Error('Choose the whole provider or its components.');
  if (selection.scope === 'whole') {
    if (selection.components !== undefined || !entry.whole) throw Error(`${entry.name} has no whole-provider status to follow.`);
    return [{scope: 'whole'}];
  }
  if (selection.scope !== 'components' || !Array.isArray(selection.components) || !selection.components.length || selection.components.length > 12 || new Set(selection.components).size !== selection.components.length) throw Error('Choose between 1 and 12 distinct components.');
  return selection.components.map(key => {
    const component = entry.components.find(item => item.key === key);
    if (!component) throw Error(`${entry.name} has no component “${String(key).slice(0, 40)}” in catalog version ${CATALOG_VERSION}.`);
    return {scope: 'component', component};
  });
}
export const targetUrl = (entry, target) => entry.source.kind === 'statuspage' && target.scope === 'component' ? `${entry.source.base}/api/v2/components.json`
  : target.scope === 'component' && target.component.url ? target.component.url : entry.source.url;
const FEED_KINDS = {feed: true};
// The assertion that reads the provider's claim. `resolved` is what the live check found: a Statuspage component's id and name.
export function claimFor(entry, target, resolved) {
  const kind = entry.source.kind;
  if (kind === 'statuspage') {
    if (target.scope === 'whole') return {json: {path: 'status.indicator', equals: 'none'}};
    if (!resolved?.id) throw Error('The live check did not find that component.');
    return {json: {path: `components[?(@.id==${JSON.stringify(resolved.id)})].status`, equals: 'operational'}};
  }
  if (kind === 'json') {
    const claim = target.scope === 'whole' ? entry.whole : target.component;
    return {json: {path: claim.path, equals: claim.equals}};
  }
  if (FEED_KINDS[kind]) {
    const signal = target.scope === 'component' ? 'rss-newest-item' : entry.source.signal, feed = FEEDS[signal];
    return {bodyRegex: {pattern: feed.pattern, flags: ''}};
  }
  throw Error('This source cannot be followed.');
}
const clip = (text, max) => text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
export function definitionFor(entry, target, resolved) {
  const component = target.scope === 'component' ? target.component : null, url = targetUrl(entry, target), shown = resolved?.name ?? component?.name;
  const name = clip(component ? `${entry.name} ${shown}${component.region ? ` · ${component.region}` : ''}` : `${entry.name} status`, 100);
  const attribution = dependencyAttribution(entry.name, url);
  return {name, type: 'http', url, method: 'GET', assertions: {status: 200, ...claimFor(entry, target, resolved)}, intervalMs: 60000, timeoutMs: 5000, retries: 1,
    confirmSlots: 2, recoverSlots: 2, probes: ['local-a'], failureQuorum: 1, freshnessMs: 180000, enabled: true, ...attribution,
    ...(component ? {group: clip(entry.source.kind === 'statuspage' ? resolved.name : `${component.name}${component.region ? ` · ${component.region}` : ''}`, 100)} : {})};
}

// DEPENDENCY-002: search the catalog and turn one followed entry into the dependency monitor definition the owner monitor
// door saves. The definition carries DEPENDENCY-001's attribution (provider as `service`, a `dependency` tag, an outcome that
// names the status as the provider's own claim) and names its catalog part in `catalog`: every scheduled check reads that part
// with the catalog's status-source reader (followed.mjs), never with an HTTP assertion over the document, and asserts only the
// provider's claim: no latency assertion, because a slow status page says nothing about the provider.
import {dependencyAttribution} from '../dependency-status.mjs';
import {CATALOG_REVIEWED, CATALOG_VERSION, ENTRIES} from './entries.mjs';
export {CATALOG_REVIEWED, CATALOG_VERSION, ENTRIES};
export const catalogEntry = id => ENTRIES.find(entry => entry.id === id) ?? null;
export const isFollowable = entry => entry.source.kind !== 'page';
// A followed part whose provider id only a live check can read: the Statuspage component, PayPal component or Google product.
export const needsProviderId = (entry, target) => target.scope === 'component' && ['statuspage', 'paypal', 'gcp'].includes(entry.source.kind);
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
    components: entry.components.map(component => ({key: component.key, name: component.name, ...(component.region ? {region: component.region} : {})})), regions, dimension: entry.dimension ?? 'Region'};
}
// One thing the owner follows: the whole provider or one component.
export function targetsFor(entry, selection) {
  if (!isFollowable(entry)) throw Error(`${entry.name} cannot yet be followed by this catalog reader. Add its status page by address to review a proposal.`);
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
// The address a part's state is read from: a Statuspage's status or component list, a feed of its own, or the entry's source.
export const targetUrl = (entry, target) => entry.source.kind === 'statuspage' ? `${entry.source.base}/api/v2/${target.scope === 'component' ? 'components' : 'status'}.json`
  : target.component?.url ?? entry.source.url;
// The catalog part a saved definition names, while the catalog still reads it from the definition's address.
export function followedTarget(definition) {
  const entry = definition?.catalog ? catalogEntry(definition.catalog.entry) : null;
  if (!entry || !isFollowable(entry)) return null;
  const component = definition.catalog.scope === 'component' ? entry.components.find(item => item.key === definition.catalog.key) : null;
  const target = definition.catalog.scope === 'whole' ? entry.whole ? {scope: 'whole'} : null : component ? {scope: 'component', component} : null;
  return target && targetUrl(entry, target) === definition.url ? {entry, target} : null;
}
const clip = (text, max) => text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
export const partName = component => `${component.name}${component.region ? ` · ${component.region}` : ''}`;
// `resolved` is what the live check found for this part; `id` is the provider's own id for it, when it has one.
export function definitionFor(entry, target, resolved) {
  const component = target.scope === 'component' ? target.component : null, url = targetUrl(entry, target);
  const name = clip(component ? `${entry.name} ${partName(component)}` : `${entry.name} status`, 100);
  return {name, type: 'http', url, method: 'GET', assertions: {status: 200}, catalog: {entry: entry.id, scope: target.scope, key: component?.key ?? null, ref: resolved?.id ?? null},
    intervalMs: 60000, timeoutMs: 5000, retries: 1, confirmSlots: 2, recoverSlots: 2, probes: ['local-a'], failureQuorum: 1, freshnessMs: 180000, enabled: true,
    ...dependencyAttribution(entry.name, url), ...(component ? {group: clip(partName(component), 100)} : {})};
}

// DEPENDENCY-002 migration: an incumbent's third-party service monitor maps onto a catalog entry. UptimeRobot publishes no
// third-party monitor type (its v3 monitor types are HTTP, KEYWORD, PING, PORT, HEARTBEAT, DNS, API and UDP), so there, and for
// a Better Stack or Site24x7 monitor of a status address, a followed provider is an ordinary monitor of the provider's status
// address: this recognises that address as a catalog entry. Site24x7 StatusIQ names its third-party services by a published
// numeric id (STATUSIQ_SERVICES). A status address or service with no entry stays an ordinary reviewed proposal or is refused.
import {catalogEntry, definitionFor, followedTarget, isFollowable, needsProviderId, ENTRIES, CATALOG_VERSION} from './index.mjs';
const hostOf = entry => [...new Set([entry.source.url, entry.source.page, entry.source.base, ...(entry.hosts ?? []).map(host => `https://${host}/`)].filter(Boolean).map(address => new URL(address).hostname))];
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : 1)) : item);
export function matchCatalogUrl(text) {
  let url;
  try { url = new URL(text); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  for (const entry of ENTRIES) {
    const component = entry.components.find(item => item.url && item.url === url.href);
    if (component && isFollowable(entry)) return {entry, target: {scope: 'component', component}};
  }
  const entry = ENTRIES.find(item => hostOf(item).includes(host));
  if (!entry) return null;
  return {entry, target: isFollowable(entry) && entry.whole ? {scope: 'whole'} : null};
}
// Looks like a provider's status page, whether or not the catalog knows it.
export const looksLikeStatusAddress = text => { try { return /(^|[.-])status([.-]|$)|statuspage|issquareup/i.test(new URL(text).hostname); } catch { return false; } };
export function catalogMapping(text) {
  const match = matchCatalogUrl(text);
  if (!match) return null;
  if (!match.target) return {entry: match.entry, target: null};
  return {entry: match.entry, target: match.target, definition: definitionFor(match.entry, match.target, null)};
}
// Site24x7 StatusIQ's published third-party service ids (StatusIQ API, Constants: third-party service ids) for the providers the
// catalog lists. Ids the catalog has no entry for are not mapped.
export const STATUSIQ_SERVICES = Object.freeze({1: 'aws', 2: 'google-cloud', 22: 'cloudflare', 27: 'stripe', 28: 'github', 42: 'zoom', 44: 'microsoft-365', 57: 'slack', 71: 'paypal'});
const plainName = text => String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
// One StatusIQ third-party component onto the catalog: the provider by its published id, the component by its name. A component
// the catalog cannot follow as such is never widened to the whole provider; the reason says what to follow instead.
export function statusIqMapping(serviceId, componentName) {
  const entry = catalogEntry(STATUSIQ_SERVICES[serviceId] ?? '');
  if (!entry) return {refused: 'The catalog has no entry for this Site24x7 third-party service.'};
  if (!isFollowable(entry)) return {refused: `${entry.name} is in the catalog, but it publishes no status Uptime can read. Add its status page by address to review a proposal instead.`};
  const wanted = plainName(componentName), component = entry.components.find(item => [item.name, item.published, item.region && `${item.name} (${item.region})`].some(name => name && plainName(name) === wanted));
  // A Statuspage or PayPal component, or a Google Cloud product, is read by the id the provider gives it, which only a live check reads.
  if (component && needsProviderId(entry, {scope: 'component', component})) return {refused: `${entry.name} components are followed by the id ${entry.name} publishes, which only a live check reads. Follow ${entry.name} ${component.name} from the catalog.`};
  if (component) return {entry, target: {scope: 'component', component}, definition: definitionFor(entry, {scope: 'component', component}, null)};
  return {refused: `The catalog follows ${entry.name}${entry.components.length ? ` components by the names ${entry.name} publishes` : ' as one whole provider'}, and “${String(componentName).slice(0, 80)}” is not one of them. Follow ${entry.name} from the catalog and choose what to follow there.`};
}
// The catalog mapping a saved definition carries, when it is exactly what following that entry's part would save (a part read
// by the provider's own id carries that id from a live check).
export function followedMappingOf(definition) {
  if (!definition || definition.type !== 'http' || !definition.tags?.includes('dependency') || !definition.catalog) return null;
  const followed = followedTarget(definition);
  if (!followed || followed.entry.name !== definition.service || (needsProviderId(followed.entry, followed.target) && !definition.catalog.ref)) return null;
  const expected = definitionFor(followed.entry, followed.target, definition.catalog.ref ? {id: definition.catalog.ref} : null);
  if (stable(expected.assertions) !== stable(definition.assertions) || stable(expected.catalog) !== stable(definition.catalog)) return null;
  return {entry_id: followed.entry.id, catalog_version: CATALOG_VERSION, scope: followed.target.scope, component_key: followed.target.component?.key ?? null};
}
export const followedPart = mapping => `${mapping.entry_id}:${mapping.scope}:${mapping.component_key ?? ''}`;
export {catalogEntry};

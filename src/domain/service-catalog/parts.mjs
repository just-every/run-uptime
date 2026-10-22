// DEPENDENCY-002: what each kind of official status source states about the parts an owner follows. One function serves the
// live check before following (refs null: each component or product is found by the name the provider publishes, and its own
// id is returned) and every scheduled check of a followed part (refs: the ids that live check found, so a renamed or removed
// part is missing, never operational). Documents are read with the shared status-source reader; only derived facts return.
import {targetUrl} from './index.mjs';
import {label} from './reader/formats.mjs';
import {problem} from './reader/read.mjs';
const OPERATIONAL_FEED_TITLES = ['Service is operating normally', 'Informational message'];
// How a feed's own entries state the provider's status.
const FEED_RULES = {
  // AWS: the newest item is the current state of that service in that region.
  'rss-newest-item': {format: 'rss', operational: feed => !feed.count || OPERATIONAL_FEED_TITLES.some(title => feed.newest.startsWith(title)), stated: feed => feed.count ? feed.newest : 'no current impact listed'},
  // Azure: the feed lists active events only.
  'rss-no-items': {format: 'rss', operational: feed => !feed.count, stated: feed => feed.count ? feed.newest : 'no active event listed'},
  // Okta: every incident is one entry whose title begins with Resolved once it is resolved.
  'atom-unresolved': {format: 'atom', operational: feed => feed.unresolved === null, stated: feed => feed.unresolved ?? 'every listed incident is resolved'},
};
const shape = what => problem('shape', `The source answered, but no longer looks like ${what}.`);
const missing = name => problem('component-missing', `The source no longer lists exactly one ${name.length > 60 ? 'part' : `part named “${name}”`}.`);
const fact = (target, state, stated, ref = null) => ({scope: target.scope, key: target.component?.key ?? null, name: target.component?.name ?? null, id: ref, state, stated: label(stated).slice(0, 60) || 'not stated'});
const statusDocumentUrl = targetUrl;
// The one published component a catalog part names: by the id followed, or by its published name (and group) exactly once.
function statuspageComponent(found, component, ref) {
  const match = component.match ?? {name: component.name};
  if (ref) { const hits = found.filter(item => item.id === ref && !item.group); return hits.length === 1 && hits[0].name === match.name ? hits[0] : null; }
  const groups = match.group ? found.filter(item => item.group && item.name === match.group) : null;
  if (groups && groups.length !== 1) return null;
  const hits = found.filter(item => !item.group && item.name === match.name && (!groups || item.groupId === groups[0].id));
  return hits.length === 1 ? hits[0] : null;
}
const KINDS = {
  async statuspage(entry, targets, read, refs) {
    const facts = new Map(), whole = targets.find(target => target.scope === 'whole'), parts = targets.filter(target => target.scope === 'component');
    if (whole) {
      const document = await read(statusDocumentUrl(entry, whole), 'statuspage-status');
      if (document.problem) return document;
      if (!document.result) return shape('a Statuspage status document');
      facts.set(whole, fact(whole, document.result.indicator === 'none' ? 'operational' : 'issue', document.result.description));
    }
    if (parts.length) {
      const matches = parts.map(target => target.component.match ?? {name: target.component.name});
      const refOf = target => refs?.[targets.indexOf(target)] ?? null;
      const document = await read(statusDocumentUrl(entry, parts[0]), 'statuspage-components', {names: matches.map(match => match.name), groups: matches.map(match => match.group).filter(Boolean), ids: parts.map(refOf).filter(Boolean)});
      if (document.problem) return document;
      if (!document.result) return shape('a Statuspage component list');
      for (const target of parts) {
        const hit = statuspageComponent(document.result, target.component, refOf(target));
        if (!hit || typeof hit.status !== 'string') return missing(target.component.name);
        facts.set(target, fact(target, hit.status === 'operational' ? 'operational' : 'issue', hit.status, hit.id));
      }
    }
    return {facts};
  },
  async json(entry, targets, read) {
    const claims = targets.map(target => target.scope === 'whole' ? entry.whole : target.component);
    const document = await read(entry.source.url, 'json-paths', {paths: claims.map(claim => claim.path)});
    if (document.problem) return document;
    const facts = new Map();
    for (const [index, target] of targets.entries()) {
      const value = document.result?.get(claims[index].path);
      if (!['string', 'number', 'boolean'].includes(typeof value)) return shape('the provider’s status document');
      facts.set(target, fact(target, value === claims[index].equals ? 'operational' : 'issue', String(value)));
    }
    return {facts};
  },
  async feed(entry, targets, read) {
    const facts = new Map();
    for (const target of targets) {
      const rule = FEED_RULES[target.scope === 'component' ? 'rss-newest-item' : entry.source.signal];
      const document = await read(statusDocumentUrl(entry, target), rule.format);
      if (document.problem) return document;
      if (!document.result) return shape(`an ${rule.format === 'rss' ? 'RSS' : 'Atom'} feed`);
      facts.set(target, fact(target, rule.operational(document.result) ? 'operational' : 'issue', rule.stated(document.result)));
    }
    return {facts};
  },
  // PayPal: each component states its production and sandbox status; a catalog part is one component in one environment.
  async paypal(entry, targets, read, refs) {
    const document = await read(entry.source.url, 'paypal-components', {names: targets.map(target => target.component.name), ids: (refs ?? []).filter(Boolean)});
    if (document.problem) return document;
    if (!document.result) return shape('PayPal’s component status list');
    const facts = new Map();
    for (const [index, target] of targets.entries()) {
      const hits = document.result.filter(item => refs ? item.id === refs[index] : item.name === target.component.name);
      const status = hits.length === 1 && hits[0].name === target.component.name ? hits[0][target.component.region] : null;
      if (typeof status !== 'string') return missing(target.component.name);
      facts.set(target, fact(target, status === 'Operational' ? 'operational' : 'issue', status, hits[0].id));
    }
    return {facts};
  },
  // Google Cloud: a product is found in products.json by its published title; incidents.json states what is open where.
  async gcp(entry, targets, read, refs) {
    const parts = targets.filter(target => target.scope === 'component');
    let ids = refs;
    if (!ids && parts.length) {
      const products = await read(entry.source.products, 'gcp-products', {titles: parts.map(target => target.component.name)});
      if (products.problem) return products;
      if (!products.result) return shape('Google Cloud’s product list');
      ids = [];
      for (const target of targets) {
        if (target.scope === 'whole') { ids.push(null); continue; }
        const hits = products.result.filter(item => item.title === target.component.name);
        if (hits.length !== 1) return missing(target.component.name);
        ids.push(hits[0].id);
      }
    }
    const document = await read(entry.source.url, 'gcp-incidents', {pairs: targets.map((target, index) => ({ref: ids?.[index], location: target.component?.region})).filter(pair => pair.ref)});
    if (document.problem) return document;
    if (!document.result) return shape('Google Cloud’s incident list');
    const facts = new Map();
    for (const [index, target] of targets.entries()) {
      const said = target.scope === 'whole' ? document.result.whole : document.result.stated.get(`${ids[index]} ${target.component.region}`);
      facts.set(target, fact(target, said ? 'issue' : 'operational', said ?? 'no open incident listed', target.scope === 'whole' ? null : ids[index]));
    }
    return {facts};
  },
};
// Facts for each target in order, or the first problem met.
export async function readParts(entry, targets, read, refs = null) {
  const outcome = await KINDS[entry.source.kind](entry, targets, read, refs);
  return outcome.problem ? outcome : {targets: targets.map(target => outcome.facts.get(target))};
}

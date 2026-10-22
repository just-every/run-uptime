// DEPENDENCY-002: the providers' published status-document formats. Each format is told what the catalog wants from one
// document (component names or the provider's own ids, a claim path, product and location pairs) and keeps only that, element
// by element, while the document streams past. `result()` is null when the document lacks the shape the format expects.
import {jsonStream} from './json-stream.mjs';
import {feedStream} from './feed-stream.mjs';
export const label = value => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
const pathKey = path => path.map(part => typeof part === 'number' ? '*' : part).join('.');
const KEPT = 400, LISTED = 200;
// The scalar fields of each element of the array at `array` (a path key, '' for the root), handed over as each element closes.
function elements(array, fields, onElement, many = []) {
  let depth = null, current = null, seen = false;
  const element = path => depth !== null && path.length === depth && pathKey(path.slice(0, -1)) === array;
  return {
    seen: () => seen,
    open(path, kind) {
      if (kind === 'array' && pathKey(path) === array && depth === null) { seen = true; depth = path.length + 1; return; }
      if (element(path)) current = {};
    },
    value(path, value) {
      if (!current || path.length <= depth || pathKey(path.slice(0, depth - 1)) !== array) return;
      const key = pathKey(path.slice(depth));
      if (many.includes(key)) { const list = current[key] ??= []; if (list.length < LISTED) list.push(value); }
      else if (fields.includes(key)) current[key] = value;
    },
    close(path) { if (current && element(path)) { onElement(current); current = null; } },
  };
}
const json = (visitor, result) => ({parser: 'json', visitor, result});
const FORMATS = {
  // Statuspage status.json: the page and its overall indicator.
  'statuspage-status'() {
    let page = false, indicator, description;
    return json({open(path, kind) { if (pathKey(path) === 'page' && kind === 'object') page = true; },
      value(path, value) { const key = pathKey(path); if (key === 'status.indicator') indicator = value; if (key === 'status.description') description = value; }},
    () => page && typeof indicator === 'string' ? {indicator, description: typeof description === 'string' ? description : indicator} : null);
  },
  // Statuspage components.json: only the components named, the groups they sit in, or the ids followed.
  'statuspage-components'({names = [], groups = [], ids = []}) {
    const found = [];
    const list = elements('components', ['id', 'name', 'status', 'group', 'group_id'], item => {
      const name = label(item.name);
      if (typeof item.id !== 'string' || !(ids.includes(item.id) || names.includes(name) || (item.group === true && groups.includes(name))) || found.length >= KEPT) return;
      found.push({id: item.id, name, status: typeof item.status === 'string' ? item.status : null, group: item.group === true, groupId: typeof item.group_id === 'string' ? item.group_id : null});
    });
    return json(list, () => list.seen() ? found : null);
  },
  // A provider's own JSON document read at named dot paths (Stripe, Slack, Microsoft 365).
  'json-paths'({paths}) {
    let object = false;
    const values = new Map();
    return json({open(path, kind) { if (!path.length && kind === 'object') object = true; },
      value(path, value) { const key = pathKey(path); if (paths.includes(key) && !values.has(key)) values.set(key, value); }},
    () => object ? values : null);
  },
  // PayPal's components API: each component with its production and sandbox status.
  'paypal-components'({names = [], ids = []}) {
    const found = [];
    const list = elements('result', ['id', 'name', 'status.production', 'status.sandbox'], item => {
      const name = label(item.name), id = typeof item.id === 'number' || typeof item.id === 'string' ? String(item.id) : null;
      if (!id || !(ids.includes(id) || names.includes(name)) || found.length >= KEPT) return;
      found.push({id, name, production: item['status.production'] ?? null, sandbox: item['status.sandbox'] ?? null});
    });
    return json(list, () => list.seen() ? found : null);
  },
  // Google Cloud products.json: the products named, with Google's id for each.
  'gcp-products'({titles}) {
    const found = [];
    const list = elements('products', ['id', 'title'], item => { if (typeof item.id === 'string' && titles.includes(label(item.title)) && found.length < KEPT) found.push({id: item.id, title: label(item.title)}); });
    return json(list, () => list.seen() ? found : null);
  },
  // Google Cloud incidents.json: an incident still open (no end, not available again) with an impact other than information
  // states an issue for the provider, and for each product it lists in each location it currently affects.
  'gcp-incidents'({pairs = []}) {
    let whole = null;
    const stated = new Map();
    const list = elements('', ['end', 'status_impact', 'most_recent_update.status'], incident => {
      const status = incident['most_recent_update.status'], impact = incident.status_impact;
      if ((incident.end ?? null) !== null || status === 'AVAILABLE' || impact === 'SERVICE_INFORMATION') return;
      const said = label(typeof status === 'string' ? status : typeof impact === 'string' ? impact : 'an open incident').slice(0, 60);
      whole ??= said;
      const products = incident['affected_products.*.id'] ?? [], locations = [...incident['currently_affected_locations.*.id'] ?? [], ...incident['most_recent_update.affected_locations.*.id'] ?? []];
      for (const {ref, location} of pairs) if (products.includes(ref) && locations.includes(location) && !stated.has(`${ref} ${location}`)) stated.set(`${ref} ${location}`, said);
    }, ['affected_products.*.id', 'currently_affected_locations.*.id', 'most_recent_update.affected_locations.*.id']);
    return json(list, () => list.seen() ? {whole, stated} : null);
  },
};
// RSS and Atom: how many items or entries, the newest one's title, and the first one not marked resolved.
function feed(root) {
  return () => {
    let name = null, count = 0, newest = null, unresolved = null;
    return {parser: 'feed', visitor: {root(value) { name = value; }, entry(title) { count++; newest ??= title; if (unresolved === null && !/^resolved\b/i.test(title)) unresolved = title; }},
      result: () => name === root ? {count, newest, unresolved} : null};
  };
}
FORMATS.rss = feed('rss');
FORMATS.atom = feed('feed');
export function reading(format, want) {
  const read = FORMATS[format](want), parser = read.parser === 'json' ? jsonStream(read.visitor) : feedStream(read.visitor);
  return {parser, result: read.result};
}

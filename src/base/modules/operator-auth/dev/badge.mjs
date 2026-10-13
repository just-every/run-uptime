import { EXCHANGE_SCRIPT, exchangeHashes } from '../dev-gate.mjs';
import { escapeHtml } from '../http.mjs';

// A slim bar at the top of the document, in normal flow so the page below it
// starts after it and nothing is ever covered. A grid body (the frames that
// centre their card) gives the bar its own auto row and keeps the card centred
// in the rest.
const STYLE = 'body:has(>#rer-dev-badge){grid-template-rows:auto 1fr}#rer-dev-badge{grid-column:1/-1;justify-self:stretch;align-self:start;position:relative;z-index:2147483647;box-sizing:border-box;width:100%;margin:0 0 12px;padding:6px 12px;border-radius:8px;background:#111827;color:#f9fafb;font:13px/1.5 system-ui,sans-serif;text-align:left}#rer-dev-badge summary{cursor:pointer;overflow-wrap:anywhere}#rer-dev-badge ul{margin:6px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:4px 16px}#rer-dev-badge li{margin:0}#rer-dev-badge a{display:inline-block;min-height:24px;color:#bfdbfe;text-decoration:underline}#rer-dev-badge a[aria-current]{color:#fff;font-weight:700}#rer-dev-badge a:focus-visible,#rer-dev-badge summary:focus-visible{outline:2px solid #fff;outline-offset:2px}';
let styleHash;
async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return `'sha256-${btoa(String.fromCharCode(...new Uint8Array(bytes)))}'`;
}

function badgeHtml({ session, choices }) {
  const current = session ? choices.find(choice => choice.email === session.operator.email)?.as : 'signed-out';
  const label = session ? `Dev: ${escapeHtml(session.operator.email)} (${escapeHtml(session.operator.role)})` : 'Dev: signed out';
  const links = [...choices.map(choice => choice.as), 'signed-out'].map(as => `<li><a href="/auth/dev/enter?as=${encodeURIComponent(as)}"${as === current ? ' aria-current="true"' : ''}>${as === 'signed-out' ? 'Sign out' : `Switch to ${escapeHtml(as)}`}</a></li>`).join('');
  return `<style>${STYLE}</style><aside id="rer-dev-badge" aria-label="Local development identity"><details><summary>${label}</summary><ul>${links}</ul></details></aside>`;
}

// Allow exactly one more inline source in a directive the document already
// restricts. Inline content an existing directive already permits stays as is.
function allow(policy, directive, source) {
  const parts = policy.split(';').map(part => part.trim()).filter(Boolean);
  const find = name => parts.findIndex(part => part.split(/\s+/)[0].toLowerCase() === name);
  let index = find(directive);
  if (index < 0) {
    const fallback = find('default-src');
    if (fallback < 0) return policy;
    parts.push([directive, ...parts[fallback].split(/\s+/).slice(1)].join(' '));
    index = parts.length - 1;
  }
  const tokens = parts[index].split(/\s+/);
  if (tokens.includes("'unsafe-inline'") && !tokens.some(token => /^'(?:nonce|sha256|sha384|sha512)-/.test(token))) return parts.join('; ');
  parts[index] = [...tokens.filter(token => token !== "'none'"), source].join(' ');
  return parts.join('; ');
}

/** Adds the fragment key exchange (root only) and the badge to an HTML document. */
export async function decorate(response, { exchange, badge }) {
  if ((!exchange && !badge) || !response.headers.get('content-type')?.toLowerCase().startsWith('text/html') || !response.body) return response;
  let bar = '', scripts = '';
  const headers = new Headers(response.headers);
  let policy = headers.get('content-security-policy');
  if (badge) {
    bar = badgeHtml(badge);
    if (policy) policy = allow(policy, 'style-src', styleHash ??= await sha256(STYLE));
  }
  if (exchange) {
    scripts = `<script>${EXCHANGE_SCRIPT}</script>`;
    if (policy) policy = allow(allow(policy, 'script-src', (await exchangeHashes()).script), 'connect-src', "'self'");
  }
  if (policy) headers.set('content-security-policy', policy);
  headers.delete('content-length');
  // The bar opens the body; the key exchange script stays at its end.
  let html = await response.text();
  const open = /<body\b[^>]*>/i.exec(html), at = open ? open.index + open[0].length : 0, end = html.lastIndexOf('</body>');
  if (end >= at) html = html.slice(0, end) + scripts + html.slice(end); else html += scripts;
  html = html.slice(0, at) + bar + html.slice(at);
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

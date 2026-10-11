import { EXCHANGE_SCRIPT, exchangeHashes } from '../dev-gate.mjs';
import { escapeHtml } from '../http.mjs';

const STYLE = '#rer-dev-badge{position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:calc(100vw - 24px);box-sizing:border-box;padding:8px 12px;border-radius:10px;background:#111827;color:#f9fafb;font:14px/1.5 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)}#rer-dev-badge summary{cursor:pointer;overflow-wrap:anywhere}#rer-dev-badge ul{margin:8px 0 0;padding:0;list-style:none}#rer-dev-badge li{margin:4px 0}#rer-dev-badge a{display:inline-block;min-height:24px;color:#bfdbfe;text-decoration:underline}#rer-dev-badge a[aria-current]{color:#fff;font-weight:700}#rer-dev-badge a:focus-visible{outline:2px solid #fff;outline-offset:2px}';
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
  const additions = [];
  const headers = new Headers(response.headers);
  let policy = headers.get('content-security-policy');
  if (badge) {
    additions.push(badgeHtml(badge));
    if (policy) policy = allow(policy, 'style-src', styleHash ??= await sha256(STYLE));
  }
  if (exchange) {
    additions.push(`<script>${EXCHANGE_SCRIPT}</script>`);
    if (policy) policy = allow(allow(policy, 'script-src', (await exchangeHashes()).script), 'connect-src', "'self'");
  }
  if (policy) headers.set('content-security-policy', policy);
  headers.delete('content-length');
  const body = await response.text(), end = body.lastIndexOf('</body>');
  const html = end < 0 ? body + additions.join('') : body.slice(0, end) + additions.join('') + body.slice(end);
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

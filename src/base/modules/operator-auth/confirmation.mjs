import { accentInk } from './branding.mjs';
import { escapeHtml, securityHeaders } from './http.mjs';

function stylesheet(accentColor) {
  return `:root{color-scheme:light;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f3f5f8}*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:32px 20px;display:grid;place-items:center}main{width:100%;max-width:480px;background:#fff;border:1px solid #dce2ea;border-radius:20px;padding:36px;box-shadow:0 12px 40px #1720330a;overflow-wrap:anywhere}.brand{font-size:14px;font-weight:650;line-height:1.5;margin:0 0 32px;color:#475569}.mark{display:block;width:32px;height:6px;border-radius:3px;border:1px solid currentColor;background:${accentColor};margin-bottom:16px}h1{font-size:30px;line-height:1.3;letter-spacing:-.02em;margin:0 0 24px;font-weight:700}p{font-size:16px;line-height:1.6;margin:0 0 24px;color:#475569}form{margin:0}button,.action{display:block;width:100%;border:1px solid #64748b;border-radius:10px;background:${accentColor};color:${accentInk(accentColor)};padding:13px 18px;font:inherit;font-weight:650;text-align:center;text-decoration:none;cursor:pointer;line-height:1.5}button:hover,.action:hover{box-shadow:inset 0 0 0 2px currentColor}button:focus-visible,.action:focus-visible{outline:3px solid #172033;outline-offset:4px}@media(max-width:480px){body{padding:24px 16px}main{padding:28px 24px}h1{font-size:28px}}@media(prefers-color-scheme:dark){:root{color-scheme:dark;background:#111827;color:#f8fafc}main{background:#1e293b;border-color:#475569;box-shadow:none}.brand,p{color:#cbd5e1}button:focus-visible,.action:focus-visible{outline-color:#f8fafc}}`;
}

export async function confirmationResponse({ branding, preview, token, method }) {
  const css = stylesheet(branding.accentColor);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(css)));
  const hash = btoa(String.fromCharCode(...digest));
  const product = escapeHtml(branding.productName);
  const heading = preview ? `${preview.kind === 'invite' ? 'Accept your invitation to' : 'Confirm sign-in to'} ${product}` : 'This link is invalid or expired';
  const content = preview
    ? `<p>This link works once and expires in ${preview.expiresInMinutes} ${preview.expiresInMinutes === 1 ? 'minute' : 'minutes'}.</p><form method="post" action="/auth/confirm"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Confirm</button></form>`
    : `<p>This link may have expired or already been used. Request a new link to continue.</p><a class="action" href="${escapeHtml(branding.signInPath)}">Request a new link</a>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${heading}</title><style>${css}</style></head><body><main><p class="brand"><span class="mark" aria-hidden="true"></span>${product}</p><h1>${heading}</h1>${content}</main></body></html>`;
  const headers = { ...securityHeaders(), 'Content-Type': 'text/html; charset=utf-8' };
  headers['Content-Security-Policy'] += `; style-src 'sha256-${hash}'`;
  // Native form POSTs need their Origin; never disclose the token path/query.
  if (preview) headers['Referrer-Policy'] = 'strict-origin';
  return new Response(method === 'HEAD' ? null : html, { status: preview ? 200 : 400, headers });
}

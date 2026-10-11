export const style = `*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#17212e;font:16px/1.6 system-ui,sans-serif}main{max-width:52rem;margin:0 auto;padding:24px 16px}h1{font-size:1.75rem;line-height:1.2}article{margin:20px 0;padding:20px;background:white;border:1px solid #cad2dc;border-radius:12px}h2{font-size:1.2rem}h1,h2,p,a,pre{overflow-wrap:anywhere;word-break:normal}pre{white-space:pre-wrap;font:inherit}a{color:#174fb5}a.open{display:block;padding:16px;margin:20px 0;border-radius:8px;background:#174fb5;color:white;font-weight:700;text-align:center;text-decoration:none;min-height:56px}small{color:#465569}`;

export function escape(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// Read link candidates as data only. Never parse or mount mail HTML in the page.
export function firstLink(message) {
  for (const body of [message.text, message.html]) {
    if (typeof body !== 'string') continue;
    for (const match of body.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      try {
        const candidate = match[0].replace(/&amp;/g, '&').replace(/[.,;!?]+$/, '');
        const url = new URL(candidate);
        if (['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password) return url.href;
      } catch { /* Malformed candidates are ordinary message text. */ }
    }
  }
  return null;
}

function metadata(row) {
  return `<h2>${escape(row.message.subject || '(No subject)')}</h2><p>To: ${escape(row.message.to.join(', '))}</p><p>Received: <time datetime="${escape(new Date(row.createdAt).toISOString())}">${escape(new Date(row.createdAt).toUTCString())}</time></p>`;
}

export function document(body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Development outbox</title><style>${style}</style></head><body><main><h1>Development outbox</h1><p>Messages captured on this computer. No email was sent.</p>${body}</main></body></html>`;
}

export function listing(rows, path) {
  return rows.length ? rows.map(row => `<article>${metadata(row)}<p><a href="${escape(`${path}?message=${encodeURIComponent(row.id)}`)}">Read message</a></p></article>`).join('') : '<p>No messages yet.</p>';
}

export function detail(row, path) {
  const link = firstLink(row.message);
  return `<p><a href="${escape(path)}">All messages</a></p><article>${metadata(row)}${link ? `<a class="open" href="${escape(link)}" rel="noreferrer noopener">Open this link</a>` : ''}<h2>Message text</h2><pre>${escape(row.message.text || row.message.html || '')}</pre>${row.message.attachments?.length ? `<p>${row.message.attachments.length} attachment(s) stored with this message.</p>` : ''}</article>`;
}

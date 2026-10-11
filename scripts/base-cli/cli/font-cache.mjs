// Fonts must survive stylesheet replacement during dev hydration without a
// network revalidation. Keep all other response headers (including repeated
// Set-Cookie fields) in their original order.
export function fontResponseHeaders(url, status, headers, requestHeaders = {}) {
 if (![200, 206, 304].includes(status)) return headers;
 let path;
 try { path = new URL(url, 'http://localhost'); } catch { return headers; }
 const index = headers.findIndex((value, index) => index % 2 === 0 && value.toLowerCase() === 'content-type');
 const mime = index < 0 ? '' : headers[index + 1].split(';', 1)[0].trim().toLowerCase();
 const fontType = /^(?:font\/[^;]+|application\/(?:font-(?:woff2?|sfnt)|x-font-(?:woff2?|ttf|otf|truetype|opentype)|vnd\.ms-opentype))$/.test(mime);
 // Vite's ?import font modules are JavaScript, not font bytes. Likewise, an
 // HTML route/error with a font suffix must retain its original policy.
 // Conditional Vite module responses may omit Content-Type. Their transform
 // queries or script destination still distinguish them from font bytes.
 const transformed = requestHeaders['sec-fetch-dest'] === 'script' || ['import', 'raw', 'url', 'inline'].some(name => path.searchParams.has(name));
 const fontPath = /\.(?:woff2?|ttf|otf)$/i.test(path.pathname) && (!mime || mime === 'application/octet-stream') &&
  (requestHeaders['sec-fetch-dest'] === 'font' || !transformed);
 if (!fontType && !fontPath) return headers;
 const packageFont = path.pathname.split('/').includes('node_modules');
 const hashed = /[.-][a-f0-9]{8,}\.(?:woff2?|ttf|otf)$/i.test(path.pathname) ||
  /\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.(?:woff2?|ttf|otf)$/.test(path.pathname) ||
  /^[a-f0-9]{8,}$/i.test(path.searchParams.get('v') ?? '');
 const result = [];
 for (let i = 0; i < headers.length; i += 2) {
  if (headers[i].toLowerCase() !== 'cache-control') result.push(headers[i], headers[i + 1]);
 }
 result.push('Cache-Control', packageFont || hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
 return result;
}

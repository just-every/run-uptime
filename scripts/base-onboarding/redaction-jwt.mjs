// Scan each base64url segment once. A header may start inside a diagnostic
// word (session-eyJ...), so retrying a regex at each eyJ in a long segment
// would be quadratic. Only three adjacent dot-separated segments can be a JWT.
const SEGMENT = /[A-Za-z0-9_-]+/g;
const HEADER = /eyJ(?=[A-Za-z0-9_-])/i;
const TOKEN_CHAR = /[A-Za-z0-9_.-]/;

export function jwtRanges(text) {
 const found = [];
 let previous = [];
 for (const part of text.matchAll(SEGMENT)) {
  const last = previous.at(-1);
  if (last && (part.index !== last.end + 1 || text[last.end] !== '.')) previous = [];
  previous.push({ start: part.index, end: part.index + part[0].length, text: part[0] });
  if (previous.length < 3) continue;
  const header = HEADER.exec(previous[0].text);
  if (header) found.push([previous[0].start + header.index, previous[2].end]);
  previous.shift();
 }
 return found;
}

export const jwtHold = { exec(text) {
 // Only the tail after the third-last dot can still become a partial JWT.
 let start = text.length, dots = 0;
 while (start > 0 && TOKEN_CHAR.test(text[start - 1])) {
  if (text[start - 1] === '.' && ++dots === 3) break;
  start--;
 }
 const at = /eyJ/i.exec(text.slice(start));
 return at ? { index: start + at.index } : null;
} };

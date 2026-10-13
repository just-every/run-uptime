// Runner-local credentials for a flow's fill steps. A credential is a private file in UPTIME_CREDENTIAL_DIR named
// <credentialRef>.json holding exactly {"origin": "https://…", "value": "…"}: the same owner-only custody, file mode and exact-origin
// binding as an HTTP request credential, with a value instead of headers. The value is read on the runner, handed to the
// browser process over a pipe, and never reaches the control plane, a definitions file, an archive, a log or a trace.
import {open, realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve, dirname} from 'node:path';

export async function readFlowSecret(reference, directory = process.env.UPTIME_CREDENTIAL_DIR) {
  if (!directory || !/^[a-zA-Z0-9_-]{1,80}$/.test(reference)) throw Error('Credential unavailable');
  let file;
  try {
    const root = await realpath(directory), path = resolve(root, `${reference}.json`);
    if (dirname(path) !== root) throw Error();
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await file.stat();
    if (!info.isFile() || (info.mode & 0o077) || info.uid !== process.getuid() || info.size > 4096) throw Error();
    const input = JSON.parse(await file.readFile('utf8'));
    if (!input || Object.keys(input).sort().join(',') !== 'origin,value' || typeof input.value !== 'string' || !input.value || input.value.length > 1024) throw Error();
    const origin = new URL(input.origin);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== input.origin) throw Error();
    return {origin: input.origin, value: input.value};
  } catch { throw Error('Credential unavailable or invalid'); } finally { await file?.close(); }
}

// A value as a site may echo it into a URL or a page: each character as typed, lowercased or uppercased, each of those raw or
// percent-encoded (its UTF-8 bytes in either case of hex, each byte also double-encoded as %25XX), whichever encoder the site used and
// however much of the value it encoded, a space also as '+' and a backslash also as the '/' a URL makes of it. Nothing is decoded
// first, so path semantics ('+' is a plus) and form semantics ('+' is a space) are both matched, and an address the site lowercases or
// uppercases is found raw or encoded.
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bytes = text => [...new TextEncoder().encode(text)].map(b => b.toString(16).padStart(2, '0'));
const encoded = text => bytes(text).map(b => `%(?:25)?${b}`).join('');
// A character's case variants: as typed, lowercased, uppercased, and lowercased where it ends a word (a final sigma).
const cases = character => [...new Set([character, character.toLowerCase(), character.toUpperCase(), `a${character}`.toLowerCase().slice(1)])];
// The 'i' flag already folds most raw case variants into one; a raw variant it folds is left out, because two alternatives that match
// the same text make a near miss backtrack exponentially in the value's length. A variant of several code points ('İ' lowercased is
// 'i' and a combining dot) matches each code point raw or encoded, as an encoder that leaves the 'i' raw writes it.
const characterForms = character => {
  const single = cases(character).filter(v => [...v].length === 1), several = cases(character).filter(v => [...v].length > 1);
  const raw = single.reduce((kept, c) => kept.some(k => new RegExp(`^${escape(k)}$`, 'i').test(c)) ? kept : [...kept, c], []);
  // Encoded forms first, so a '%' of the value takes its whole escape rather than leaving the escape's digits behind.
  return [...new Set([...single.map(encoded), ...several.map(v => [...v].map(p => `(?:${encoded(p)}|${escape(p)})`).join('')), ...raw.map(escape)])]
    .concat(character === ' ' ? ['\\+'] : character === '\\' ? ['/'] : []);
};
// The most text one character's forms occupy: a double-encoded byte is five characters.
const width = character => Math.max(...cases(character).map(c => Math.max(c.length, 5 * bytes(c).length)));
const pattern = value => [...value].map(c => `(?:${characterForms(c).join('|')})`).join('');
/** A function that replaces every value of `credentials` in a text with [credential], in any encoding a URL gives it, and then cuts
 * the text to `limit` characters. Redaction always comes first: a value that crosses the cut is replaced whole, never cut into a
 * part that no longer matches. */
export function credentialRedactor(credentials) {
  const values = [...new Set(Object.values(credentials).map(c => c.value).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!values.length) return (text, limit = Infinity) => text.slice(0, limit);
  const matcher = new RegExp(values.map(pattern).join('|'), 'gi');
  // The longest text one value can occupy: an occurrence that starts before the cut ends within this many characters past it.
  const reach = Math.max(...values.map(v => [...v].reduce((n, c) => n + width(c), 0)));
  return (text, limit = Infinity) => text.slice(0, limit + reach).replace(matcher, '[credential]').slice(0, limit);
}

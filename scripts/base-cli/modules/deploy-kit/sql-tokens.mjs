import { assert } from './validation.mjs';

// SQLite quotes escape themselves by doubling, except brackets, which end at ].
// Keep quoted tokens intact: their punctuation and keywords are never syntax.
export function sqlTokens(sql) {
  assert(!sql.includes('\0'), 'unsafe-migration-control');
  const tokens = [];
  let offset = 0;
  while (offset < sql.length) {
    const start = offset;
    const char = sql[offset++];
    if (/[\t\n\v\f\r \uFEFF]/.test(char)) continue;
    if (char === '-' && sql[offset] === '-') {
      const end = sql.indexOf('\n', offset + 1);
      offset = end < 0 ? sql.length : end + 1;
      continue;
    }
    if (char === '/' && sql[offset] === '*') {
      const end = sql.indexOf('*/', offset + 1);
      // An open comment could swallow the controller's appended completion SQL.
      assert(end >= 0, 'unsafe-migration-control');
      offset = end + 2;
      continue;
    }
    if (`'\"\`[`.includes(char)) {
      const closing = char === '[' ? ']' : char;
      let value = '', closed = false;
      while (offset < sql.length) {
        const next = sql[offset++];
        if (next !== closing) { value += next; continue; }
        if (char !== '[' && sql[offset] === closing) { value += closing; offset++; continue; }
        closed = true;
        break;
      }
      assert(closed, 'unsafe-migration-control');
      tokens.push({ kind: char === "'" ? 'string' : 'identifier', value });
    } else if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(sql[offset] ?? ''))) {
      const number = /^(?:0[xX][0-9a-fA-F_]+|(?:[0-9][0-9_]*(?:\.[0-9_]*)?|\.[0-9][0-9_]*)(?:[eE][+-]?[0-9][0-9_]*)?)/.exec(sql.slice(start))[0];
      offset = start + number.length;
      tokens.push({ kind: 'number', value: number });
    } else if (/[A-Za-z_\u0080-\uFFFF]/.test(char)) {
      while (offset < sql.length && /[A-Za-z0-9_$\u0080-\uFFFF]/.test(sql[offset])) offset++;
      tokens.push({ kind: 'word', value: sql.slice(start, offset) });
    } else {
      tokens.push({ kind: 'symbol', value: char });
    }
  }
  return tokens;
}

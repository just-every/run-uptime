// DEPENDENCY-002: a streaming JSON reader for status documents. Text is pushed in as it arrives; the reader reports every
// container it opens and closes and every scalar with its path, and never holds the document. What it keeps is the path of
// the open containers and the one token being read (a string is kept up to KEEP characters, the rest is scanned and dropped),
// so a megabyte of components costs the same memory as one. Anything that is not one JSON value throws.
const KEEP = 400, MAX_DEPTH = 64;
const ESCAPES = {'"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t'};
const bad = where => { throw Error(`Not a JSON document (${where})`); };
// visitor: open(path, 'object'|'array'), close(path, kind), value(path, scalar). A path is the keys and indexes from the root.
export function jsonStream(visitor) {
  const stack = [];
  let state = 'value', text = '', kept = 0, escape = false, unicode = null, isKey = false, token = '', finished = false;
  const path = () => stack.map(frame => frame.array ? frame.index : frame.key);
  const open = kind => {
    if (stack.length >= MAX_DEPTH) bad('nested too deeply');
    visitor.open?.(path(), kind);
    stack.push({array: kind === 'array', key: null, index: -1});
    state = kind === 'array' ? 'first-item' : 'first-key';
  };
  const close = () => { const frame = stack.pop(); visitor.close?.(path(), frame.array ? 'array' : 'object'); after(); };
  const after = () => { state = stack.length ? 'after' : 'done'; };
  // A value is about to start in the current container: advance its index.
  const enter = () => { const frame = stack.at(-1); if (frame?.array) frame.index++; };
  const scalar = value => { visitor.value?.(path(), value); after(); };
  const literal = () => {
    const value = token === 'true' ? true : token === 'false' ? false : token === 'null' ? null : /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(token) ? Number(token) : bad('a malformed literal');
    token = ''; scalar(value);
  };
  function startValue(char) {
    enter();
    if (char === '{') return open('object');
    if (char === '[') return open('array');
    if (char === '"') { state = 'string'; isKey = false; text = ''; kept = 0; return; }
    if (/[-0-9tfn]/.test(char)) { state = 'literal'; token = char; return; }
    bad('an unexpected character');
  }
  function step(char) {
    switch (state) {
      case 'string':
        if (unicode !== null) {
          unicode += char;
          if (!/^[0-9a-fA-F]*$/.test(unicode)) bad('a malformed escape');
          if (unicode.length === 4) { keep(String.fromCharCode(parseInt(unicode, 16))); unicode = null; }
          return;
        }
        if (escape) { escape = false; if (char === 'u') { unicode = ''; return; } if (!(char in ESCAPES)) bad('a malformed escape'); keep(ESCAPES[char]); return; }
        if (char === '\\') { escape = true; return; }
        if (char === '"') {
          if (isKey) { stack.at(-1).key = text; state = 'colon'; } else scalar(text);
          return;
        }
        if (char < ' ') bad('a control character in a string');
        keep(char); return;
      case 'literal':
        if (/[0-9a-zA-Z.+-]/.test(char)) { if (token.length > 40) bad('an overlong literal'); token += char; return; }
        literal(); return step(char);
    }
    if (char === ' ' || char === '\n' || char === '\r' || char === '\t') return;
    switch (state) {
      case 'value': return startValue(char);
      case 'first-item': if (char === ']') return close(); return startValue(char);
      case 'first-key': if (char === '}') return close();
      // falls through: a key
      case 'key': if (char !== '"') bad('a missing key'); state = 'string'; isKey = true; text = ''; kept = 0; return;
      case 'colon': if (char !== ':') bad('a missing colon'); state = 'value'; return;
      case 'after': {
        const frame = stack.at(-1);
        if (char === ',') { state = frame.array ? 'value' : 'key'; return; }
        if (char === (frame.array ? ']' : '}')) return close();
        return bad('a missing comma');
      }
      case 'done': return bad('text after the document');
    }
  }
  function keep(char) { if (kept < KEEP) { text += char; kept++; } }
  return {
    write(chunk) { if (finished) bad('text after the end'); for (const char of chunk) step(char); },
    end() {
      if (state === 'literal') literal();
      finished = true;
      if (state !== 'done') bad('the document ended early');
    },
  };
}

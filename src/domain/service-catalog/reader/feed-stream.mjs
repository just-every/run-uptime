// DEPENDENCY-002: a streaming reader for RSS and Atom status feeds. Text is pushed in as it arrives; the reader reports the
// root element, each item or entry with its title, and whether the root closed, and never holds the feed. What it keeps is the
// open element names and the title being read (up to KEEP characters). Markup it does not need (descriptions, attributes,
// comments, processing instructions) is scanned and dropped.
const KEEP = 300, MAX_DEPTH = 32;
const ENTITIES = {lt: '<', gt: '>', amp: '&', quot: '"', apos: "'"};
const decode = text => text.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-z]{2,4});/g, (whole, name) => {
  if (name[0] !== '#') return ENTITIES[name] ?? whole;
  const code = name[1] === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
});
const bad = where => { throw Error(`Not an RSS or Atom feed (${where})`); };
// visitor: root(name), entry(title) for each <item> or <entry> in document order, and the stream's end() says whether the root closed.
export function feedStream(visitor) {
  const stack = [];
  let state = 'text', tag = '', quote = null, rootClosed = false, rootName = null, title = null, inTitle = false, pending = '', special = '';
  const inEntry = () => stack.some(name => name === 'item' || name === 'entry');
  const local = name => name.replace(/^[a-zA-Z0-9_-]+:/, '').toLowerCase();
  function text(chunk) { if (inTitle && title.length < KEEP) title += chunk.slice(0, KEEP - title.length); }
  function element(raw) {
    if (raw.startsWith('/')) {
      const name = local(raw.slice(1).trim());
      if (stack.at(-1) !== name) bad('a mismatched closing tag');
      stack.pop();
      if (name === 'title' && inTitle) inTitle = false;
      if ((name === 'item' || name === 'entry') && !inEntry()) { visitor.entry?.(decode(title ?? '').replace(/\s+/g, ' ').trim()); title = null; }
      if (!stack.length) rootClosed = true;
      return;
    }
    const selfClosing = raw.endsWith('/'), name = local((selfClosing ? raw.slice(0, -1) : raw).trim().split(/\s/)[0] ?? '');
    if (!name) bad('an empty tag');
    if (rootClosed) bad('markup after the root element');
    if (!stack.length) { rootName = name; visitor.root?.(name); }
    if (selfClosing) return;
    if (stack.length >= MAX_DEPTH) bad('nested too deeply');
    if ((name === 'item' || name === 'entry') && !inEntry()) title = '';
    if (name === 'title' && title !== null && !inTitle && stack.at(-1) === (stack.includes('item') ? 'item' : 'entry')) inTitle = true;
    stack.push(name);
  }
  function step(char) {
    switch (state) {
      case 'text':
        if (char === '<') { state = 'open'; tag = ''; return; }
        if (!stack.length && !/\s/.test(char)) bad('text outside the root element');
        return text(char);
      case 'open':
        if (char === '!') { state = 'bang'; special = ''; return; }
        if (char === '?') { state = 'pi'; special = ''; return; }
        state = 'tag'; // falls through
      case 'tag':
        if (quote) { if (char === quote) quote = null; return; }
        if (char === '"' || char === "'") { quote = char; return; }
        if (char === '>') { state = 'text'; return element(tag); }
        if (tag.length < 200) tag += char;
        return;
      case 'pi': special = (special + char).slice(-2); if (special === '?>') state = 'text'; return;
      case 'bang':
        special += char;
        if (special === '[CDATA[') { state = 'cdata'; pending = ''; return; }
        if (special === '--') { state = 'comment'; special = ''; return; }
        if (!'[CDATA['.startsWith(special) && special !== '-') { state = 'declaration'; return; }
        return;
      case 'declaration': if (char === '>') state = 'text'; return;
      case 'comment': special = (special + char).slice(-3); if (special === '-->') state = 'text'; return;
      case 'cdata':
        // A CDATA section's text is literal: an ampersand is encoded so the title's entity decoding leaves it as written.
        if (char === ']') { pending += ']'; if (pending.length > 2) { text(pending[0]); pending = pending.slice(1); } return; }
        if (char === '>' && pending === ']]') { pending = ''; state = 'text'; return; }
        text((pending + char).replace(/&/g, '&amp;')); pending = ''; return;
    }
  }
  return {
    write(chunk) { for (const char of chunk) step(char); },
    end() { if (state !== 'text' || !rootClosed) bad('the feed ended early'); return {root: rootName}; },
  };
}

import { StringDecoder } from 'node:string_decoder';
import { jwtRanges, jwtHold } from './redaction-jwt.mjs';

const MASK = '[REDACTED]';
const PEM_BEGIN = /-----BEGIN [A-Z0-9 ]{0,64}PRIVATE KEY(?: BLOCK)?-----/g;
const PEM_END = /-----END [A-Z0-9 ]{0,64}PRIVATE KEY(?: BLOCK)?-----/g;
// A credential variable name has a credential word as a whole word part:
// GITHUB_TOKEN, db-password, apiKey or TOKEN, never PATH, DESIGN_MODE,
// SIGNAL_NAME, KEYBOARD_LAYOUT, COMPASS_DIR or AUTHOR_NAME.
const CREDENTIAL_WORD = 'token|secret|credential|key|pat|dsn|auth|pass|passwd|password|pwd|signature|sig|cookie|apikey|accesskey|privatekey|secretkey|authtoken|accesstoken';
const CREDENTIAL_NAME = new RegExp(`(?:^|[_.-])(?:${CREDENTIAL_WORD})s?(?:$|[_.-])`, 'i');
// Keep camelCase matching separate: inline flag modifiers are unavailable in
// Base's maintained Node 22 runtime. These names require a real case boundary.
const CAMEL_CREDENTIAL_NAME = /[A-Za-z0-9](?:Token|Secret|Credential|Key|Pat|Dsn|Auth|Pass|Passwd|Password|Pwd|Signature|Sig|Cookie)s?(?:$|[_.-]|[A-Z0-9])/;
const FIELD_NAME = '(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|password|secret|signature|sig|key|pat|dsn|auth|pass)';
// A field name may follow `_` or `-` (DB_PASSWORD, client_secret, x-api-key),
// but not a letter or digit inside an ordinary word.
const FIELD = '(?<![A-Za-z0-9])' + FIELD_NAME;
// camelCase and PascalCase-suffixed names (refreshToken, clientSecret,
// privateKey, dbPassword, AccountKey) match case-sensitively after a letter
// or digit, including an acronym prefix (APIToken, AWSSecretKey).
// Case-sensitive credential words still exclude ordinary "Tokens"/"keyboard".
const CAMEL_SUFFIX = '(?:Token|Secret|Password|Passwd|Key|Pat|Dsn|Auth|Pass|Signature|Sig)';
const CAMEL_FIELD = '(?<=[A-Za-z0-9])' + CAMEL_SUFFIX;
// Stream holds retain the preceding character. Flushing it would turn an
// ambiguous camel suffix into a standalone field with different value rules.
const CAMEL_CONTEXT = '[A-Za-z0-9]' + CAMEL_SUFFIX;
// A boolean or 0/1 flag after a credential-shaped name (SKIP_AUTH=1,
// DISABLE_AUTH=true) is configuration, not a credential.
const FLAG_WORDS = 'true|false|yes|no|on|off|null|none|0|1'.replace(/[a-z]/g, letter => `[${letter}${letter.toUpperCase()}]`);
const NOT_FLAG = '(?!(?:' + FLAG_WORDS + ')(?:[\\s"\'<>;&,)\\]}]|$))';
// A quoted value is private up to its closing quote, spaces included.
// Escape pairs cannot be closing quotes; a trailing escape waits for more text.
const DOUBLE_QUOTED = /"(?:\\[^\r\n]|[^"\\\r\n])*(?:\\(?=[\r\n]|$))?/.source;
const SINGLE_QUOTED = /'(?:\\[^\r\n]|[^'\\\r\n])*(?:\\(?=[\r\n]|$))?/.source;
const PRIVATE_VALUE = `(?:${DOUBLE_QUOTED}(?:"|(?=[\\r\\n]|$))|${SINGLE_QUOTED}(?:'|(?=[\\r\\n]|$))|[^\\s"'<>;&]+)`;
const FIELD_VALUE = '["\']?\\s*[=:]\\s*' + NOT_FLAG + PRIVATE_VALUE;
const CLI_PREFIX = '(?<![A-Za-z0-9_-])--(?:[A-Za-z0-9]+[_-])*';
const CLI_ARGUMENT = CLI_PREFIX + '(' + FIELD_NAME + ')\\s+' + NOT_FLAG + '(' + PRIVATE_VALUE + ')';
// A bare Bearer/Basic value must look like a credential, not the next word of
// prose such as "Basic checks passed"; after Authorization any value is private.
const AUTH_CHAR = '[A-Za-z0-9._~+/-]';
// A slash alone is a path ("Basic usage/options", "Bearer /path"), not a
// credential signal; 20 leading characters without a slash still count.
const BARE_AUTH = '\\b(?:Bearer|Basic)\\s+(?=' + AUTH_CHAR + '*[0-9+=]|[A-Za-z0-9._~+-]{20})' + AUTH_CHAR + '{8,}=*';
// Any scheme word after Authorization (Bearer, Basic, token, Digest, ...) and
// the rest of a Cookie or Set-Cookie header are private.
const AUTH_PARAMS = '(?:[A-Za-z0-9_-]+=(?:"[^"\\r\\n]*"|[^\\s",<>]+)\\s*(?:,\\s*)?)+';
const AUTH_HEADER = '\\b(?:Proxy-)?Authorization["\']?\\s*[=:]\\s*["\']?[A-Za-z][A-Za-z0-9_-]*\\s+(?:' + AUTH_PARAMS + '|[^\\s"\'<>]+)';
const COOKIE_HEADER = '(?<![A-Za-z0-9_-])(?:Set-)?Cookie["\']?\\s*:\\s*(?:[^\\s=;,"\'<>]+=[^\\s;,"\'<>]*\\s*(?:;\\s*)?)+';
// Userinfo ends at the last @ before the path, query or fragment, so a password
// may contain @. A password containing / is recognised when the text after the
// first : is not a port; that password is bounded and never backtracked, so
// repeated schemes on one line stay linear. Start only at a scheme boundary:
// retrying a scheme at every character of a long ordinary line otherwise
// backtracks quadratically.
const SCHEME = '(?<![a-z0-9+.-])[a-z][a-z0-9+.-]*://';
const USERINFO = SCHEME + '([^\\s/?#"<>`]*)@';
const SLASHED_USERINFO = SCHEME + '([^\\s/?#:@"<>`\\[\\]]*:(?![0-9]*(?:[/?#\\s"<>`]|$))(?=(?<password>[^\\s"<>`@]{0,128}))\\k<password>)@';
const PATTERNS = new RegExp('(?:' + [
 AUTH_HEADER, BARE_AUTH,
 '(?<![A-Za-z0-9_])(?:gh[pousr]_|github_pat_|sk-(?:proj-)?|sk_live_|sk_test_|rk_live_|rk_test_|pk_live_|whsec_|SG\\.|xox[baprs]-|AKIA|ASIA|AIza|npm_|glpat-|pypi-|hf_|re_)[A-Za-z0-9_./+=-]+',
 FIELD + FIELD_VALUE, COOKIE_HEADER,
 USERINFO, SLASHED_USERINFO,
].join('|') + ')', 'gi');
const CAMEL_PATTERN = new RegExp('(' + CAMEL_FIELD + ')["\']?\\s*[=:]\\s*' + NOT_FLAG + '(' + PRIVATE_VALUE + ')', 'g');
const CLI_PATTERN = new RegExp(CLI_ARGUMENT, 'gi');
// Key/Auth/Pass/Token also name ordinary diagnostics. For inferred suffixed
// fields and separate CLI arguments, require a non-trivial value. Explicit
// secret registration remains exact, even for short credentials.
const AMBIGUOUS_FIELD = /^(?:key|auth|pass|token)$/i;
const MIN_ASSIGNMENT_VALUE = 8;
const privateAssignment = match => !AMBIGUOUS_FIELD.test(match[1]) || match[2].replace(/^["']|["']$/g, '').length >= MIN_ASSIGNMENT_VALUE;
// Holds for text that may still continue. Complete text, and the end of a
// stream, has nothing more to arrive, so a trailing bare field name, dash run
// or plain host:port is ordinary diagnostic text there.
const PREFIX_TAIL = '["\']?\\s*(?:[=:]\\s*)?["\']?$';
const FIELD_PREFIX = new RegExp('(?:\\b(?:Bearer|Basic)|' + FIELD + ')' + PREFIX_TAIL, 'i');
const CAMEL_PREFIX = new RegExp(CAMEL_CONTEXT + PREFIX_TAIL);
const CLI_PREFIX_HOLD = new RegExp(CLI_PREFIX + FIELD_NAME + '\\s+$', 'i');
// Keep a quoted value's opening field until its closing quote arrives, even
// when its first word is too short to classify as a credential yet.
const QUOTED_TAIL = '((?:' + DOUBLE_QUOTED + '|' + SINGLE_QUOTED + '))$';
const QUOTED_HOLDS = [
 new RegExp(FIELD + '["\']?\\s*[=:]\\s*' + QUOTED_TAIL, 'i'),
 new RegExp(CAMEL_CONTEXT + '["\']?\\s*[=:]\\s*' + QUOTED_TAIL),
 new RegExp(CLI_PREFIX + FIELD_NAME + '\\s+' + QUOTED_TAIL, 'i'),
];
// A short unquoted value may still grow into a secret or out of a flag. Keep
// its field context until the value ends or its classification is settled.
const SHORT_VALUE_TAIL = `[^\\s"'<>;&]{1,${MIN_ASSIGNMENT_VALUE - 1}}(?![\\s\\S])`;
const SHORT_FIELD_HOLDS = [
 new RegExp(FIELD + '["\']?\\s*[=:]\\s*' + SHORT_VALUE_TAIL, 'i'),
 new RegExp(CAMEL_CONTEXT + '["\']?\\s*[=:]\\s*' + SHORT_VALUE_TAIL),
 new RegExp(CLI_PREFIX + FIELD_NAME + '\\s+' + SHORT_VALUE_TAIL, 'i'),
];
const PEM_HEADER_HOLD = /-----BEGIN (?![A-Z0-9 ]*-----)[^\n]*$/;
const STREAM_HOLDS = [jwtHold, new RegExp(SCHEME + '[^\\s/?#"<>`]*$', 'i'), PEM_HEADER_HOLD];
const COMPLETE_HOLDS = [jwtHold, new RegExp(SCHEME + '[^\\s/?#:@"<>`]*:(?![0-9]*$)[^\\s/?#"<>`]*$', 'i'), PEM_HEADER_HOLD];
const CREDENTIAL_URL = new RegExp(USERINFO + '|' + SLASHED_USERINFO, 'i');
const userinfoPasswords = value => [USERINFO, SLASHED_USERINFO].flatMap(source => {
 const userinfo = new RegExp(source, 'i').exec(value)?.[1] ?? '', at = userinfo.indexOf(':');
 if (at < 0) return [];
 const password = userinfo.slice(at + 1);
 let decoded = password;
 try { decoded = decodeURIComponent(password); } catch {}
 return [password, decoded];
});

// Stateful stripping also covers UTF-8 C1 controls, which stripVTControlCharacters
// alone leaves behind. Broken control strings recover at a line or 4 KiB.
function controlCleaner() {
 let state = '', length = 0;
 return {
  write(text) {
   let output = '';
   for (const char of text) {
    if (state) {
     if (char === '\n' || char === '\r') { state = ''; length = 0; output += '\n'; continue; }
     if (++length >= 4096) { state = ''; length = 0; continue; }
     if (state === 'escape') {
      state = char === '[' ? 'csi' : ']PX^_'.includes(char) ? 'string' : '';
     } else if (state === 'csi') {
      if (char >= '@' && char <= '~') state = '';
     } else if (char === '\x07' || char === '\x9c' || (state === 'stringEscape' && char === '\\')) state = '';
     else state = char === '\x1b' ? 'stringEscape' : 'string';
     continue;
    }
    if (char === '\x1b') { state = 'escape'; length = 0; continue; }
    if (char === '\x9b') { state = 'csi'; length = 0; continue; }
    if ('\x90\x98\x9d\x9e\x9f'.includes(char)) { state = 'string'; length = 0; continue; }
    if (char === '\r') output += '\n';
    else if (char === '\n' || char === '\t' || (char >= ' ' && !/[\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(char))) output += char;
   }
   return output;
  },
  reset() { state = ''; length = 0; }
 };
}
const cleanText = text => controlCleaner().write(String(text));

// Keep every value for this session, even after its credential scope is cleared.
export function createRedaction({mask = MASK} = {}) {
 const secrets = new Set();
 let longest = 1;
 // Each known value is registered with the encodings and parts a tool may print
 // instead of its exact bytes. A derived form shorter than eight characters
 // (and than the value) is skipped so it cannot erase ordinary digits or words.
 const encodings = value => {
  const bytes = Buffer.from(value), encoded = encodeURIComponent(value.toWellFormed()), base64 = bytes.toString('base64');
  const json = JSON.stringify(value).slice(1,-1);
  const forms = [value, value.toUpperCase(), value.toLowerCase(),
   value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])),
   value.replaceAll("'", "'\\''"),
   cleanText(value), cleanText(value.replace(/\r?\n/g,'\r\n')), json,
   json.replace(/[^\x00-\x7e]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4,'0')),
   base64, base64.replace(/=+$/,''), bytes.toString('base64url'), encoded,
   new URLSearchParams({value}).toString().slice('value='.length),
   encoded.replace(/%[0-9A-F]{2}/g, part => part.toLowerCase()), encoded.replace(/%20/g, '+'), encodeURIComponent(encoded)];
  if (value.length >= 8) forms.push(bytes.toString('hex'), bytes.toString('hex').toUpperCase());
  return forms;
 };
 const addSecrets = input => {
  if (typeof input === 'string' && input) {
   const minimum = Math.min(8, input.length);
   const parts = [input, input.trim(), ...userinfoPasswords(input)].filter(part => part.length >= minimum);
   for (const value of new Set(parts.flatMap(encodings))) if (value.length >= minimum) { secrets.add(value); longest = Math.max(longest, value.length); }
  } else if (input && typeof input === 'object') for (const value of Object.values(input)) addSecrets(value);
 };
 const ranges = text => {
  const assignments = [...text.matchAll(CAMEL_PATTERN), ...text.matchAll(CLI_PATTERN)].filter(privateAssignment);
  const found = [...text.matchAll(PATTERNS), ...assignments].map(match => [match.index, match.index + match[0].length]);
  found.push(...jwtRanges(text));
  for (const begin of text.matchAll(PEM_BEGIN)) {
   const end = [...text.slice(begin.index + begin[0].length).matchAll(PEM_END)][0];
   found.push([begin.index, end ? begin.index + begin[0].length + end.index + end[0].length : text.length]);
  }
  for (const secret of secrets) {
   let from = 0, at;
   while ((at = text.indexOf(secret, from)) >= 0) { found.push([at, at + secret.length]); from = at + 1; }
  }
  return found.sort((a,b) => a[0]-b[0]);
 };
 const replace = text => {
  let end = 0, result = '';
  for (const [start,stop] of ranges(text)) {
   if (stop <= end) continue;
   if (start >= end) result += text.slice(end,start) + mask;
   end = stop;
  }
  return result + text.slice(end);
 };
 // `complete` text has nothing more to arrive: only a registered secret's prefix,
 // a credential-shaped URL authority, a partial JWT or private-key header, or an
 // unterminated private-key block stays held there.
 const incompleteStart = (text, minimumPrefix=1, complete=false) => {
  let cutoff = text.length;
  for (const secret of secrets) {
   // The earliest start whose remaining text begins this secret is its longest held prefix.
   for (let at=Math.max(0,text.length-secret.length+1); at<=text.length-minimumPrefix; at++) {
    if (text.charCodeAt(at)===secret.charCodeAt(0) && secret.startsWith(text.slice(at))) { cutoff=Math.min(cutoff,at); break; }
   }
  }
  if (!complete) {
   for (const pattern of [FIELD_PREFIX, CAMEL_PREFIX, CLI_PREFIX_HOLD, ...QUOTED_HOLDS, ...SHORT_FIELD_HOLDS]) {
    const prefix = pattern.exec(text);
    if (prefix) cutoff = Math.min(cutoff,prefix.index);
   }
   const pemPrefix = '-----BEGIN ';
   for (let size=pemPrefix.length-1; size>=minimumPrefix; size--) if (text.endsWith(pemPrefix.slice(0,size))) cutoff=Math.min(cutoff,text.length-size);
  }
  // A JWT header, URL authority, and private-key header are private even before
  // the signature, @ delimiter, or full PEM header arrives.
  for (const pattern of complete ? COMPLETE_HOLDS : STREAM_HOLDS) {
   const match = pattern.exec(text); if (match) cutoff = Math.min(cutoff,match.index);
  }
  for (const begin of text.matchAll(PEM_BEGIN)) {
   if (![...text.slice(begin.index + begin[0].length).matchAll(PEM_END)].length) cutoff=Math.min(cutoff,begin.index);
  }
  return cutoff;
 };
 const snapshot = (text, minimumPrefix=1, complete=false) => {
  let cutoff = incompleteStart(text,minimumPrefix,complete);
  for (const [start,end] of ranges(text)) if (start<cutoff && end>cutoff) cutoff=start;
  return replace(text.slice(0,cutoff)) + (cutoff<text.length ? mask : '');
 };
 const redact = text => snapshot(cleanText(text),4,true);
 const stream = emit => {
  const decoder = new StringDecoder('utf8'), cleaner = controlCleaner();
  let pending = '', discardToken = false, discardQuote = '', discardEscaped = false, discardPem = false, pemTail = '';
  const drain = () => {
   let cutoff = Math.max(pending.lastIndexOf('\n')+1, pending.length-Math.max(256,longest-1));
   cutoff = Math.min(cutoff,incompleteStart(pending));
   for (const [start,end] of ranges(pending)) if (start<cutoff && end>cutoff) cutoff=start;
   if (cutoff) { emit(replace(pending.slice(0,cutoff))); pending=pending.slice(cutoff); }
   // Tokens and PEM bodies can be arbitrarily large; never retain their tails.
   if (pending.length > longest+16384) {
    discardPem = [...pending.matchAll(PEM_BEGIN)].some(begin => ![...pending.slice(begin.index+begin[0].length).matchAll(PEM_END)].length);
    pemTail = discardPem ? pending.slice(-128) : '';
    const quoted = QUOTED_HOLDS.map(pattern => pattern.exec(pending)).filter(Boolean).sort((a,b) => a.index-b.index)[0];
    discardQuote = !discardPem && quoted ? quoted[1][0] : '';
    discardEscaped = !!discardQuote && ((/\\+$/.exec(pending)?.[0].length ?? 0) % 2 === 1);
    emit(snapshot(pending,4)); pending=''; discardToken=!discardPem&&!discardQuote;
   }
  };
  const pushText = text => {
   text = cleaner.write(text);
   if (discardPem) {
    const combined = pemTail+text, end = [...combined.matchAll(PEM_END)][0];
    if (!end) { pemTail=combined.slice(-128); return; }
    text=combined.slice(end.index+end[0].length); pemTail=''; discardPem=false;
   }
   if (discardQuote) {
    let at = 0;
    for (; at < text.length; at++) {
     const char = text[at];
     if (char === '\n' || char === '\r') { discardQuote=''; break; }
     if (discardEscaped) { discardEscaped=false; continue; }
     if (char === '\\') { discardEscaped=true; continue; }
     if (char === discardQuote) { discardQuote=''; at++; break; }
    }
    if (discardQuote) return;
    text = text.slice(at); discardEscaped=false;
   }
   if (discardToken) {
    const at=text.search(/[\s"'<>]/); if (at<0) return;
    text=text.slice(at); discardToken=false;
   }
   pending+=text; drain();
  };
  return {
   write(chunk) {
    // Decode and clean bounded slices, even when a producer hands us 100 MiB.
    if (Buffer.isBuffer(chunk) || ArrayBuffer.isView(chunk)) {
     const bytes=Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk.buffer,chunk.byteOffset,chunk.byteLength);
     for (let index=0; index<bytes.length; index+=4096) pushText(decoder.write(bytes.subarray(index,index+4096)));
    } else {
     const text=String(chunk);
     for (let index=0; index<text.length;) { let end=Math.min(text.length,index+4096); if (end<text.length && /[\ud800-\udbff]/.test(text[end-1])) end--; pushText(text.slice(index,end)); index=end; }
    }
   },
   end() { pushText(decoder.end()); emit(snapshot(pending,4,true)); pending=''; discardToken=false; discardQuote=''; discardEscaped=false; discardPem=false; pemTail=''; cleaner.reset(); },
   snapshot: () => snapshot(pending),
   get bufferedLength() { return pending.length+pemTail.length; }
  };
 };
 return {addSecrets,redact,stream};
}

export function credentialValues(input, declared = []) {
 if (!input || typeof input !== 'object') return [];
 return Object.entries(input).flatMap(([key,value]) => {
  // An explicit model declaration remains an exact secret contract, including
  // short values. Environment heuristics must not turn boolean flags into masks.
  if (typeof value === 'string') return declared.includes(key) || (value.length>=8 && (CREDENTIAL_NAME.test(key) || CAMEL_CREDENTIAL_NAME.test(key) || CREDENTIAL_URL.test(value))) ? [value] : [];
  return value && typeof value==='object' ? credentialValues(value,declared) : [];
 });
}

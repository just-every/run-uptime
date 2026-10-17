import {RE2JS} from 're2js';

// RE2 has linear matching time and never executes JavaScript. Bound the source
// and repetition expansion as well, before allocating the compiled program.
function boundExpansion(pattern) {
  let expanded = pattern.length, inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\') { i++; continue; }
    if (pattern[i] === '[') inClass = true;
    if (pattern[i] === ']') inClass = false;
    if (inClass || pattern[i] !== '{') continue;
    const repeat = /^\{([0-9]+)(?:,([0-9]*))?\}/.exec(pattern.slice(i));
    if (!repeat) continue;
    expanded *= Math.max(1, Number(repeat[2] || repeat[1]));
    if (expanded > 4096) throw Error('Invalid body regex: repetition expansion is too large');
    i += repeat[0].length - 1;
  }
}
export function compileBodyRegex({pattern, flags = ''}) {
  if (typeof pattern !== 'string' || !pattern.length || pattern.length > 500 ||
      typeof flags !== 'string' || !/^[ims]*$/.test(flags) || new Set(flags).size !== flags.length) {
    throw Error('Invalid body regex: use a pattern of 1–500 characters and unique i, m or s flags');
  }
  boundExpansion(pattern);
  let compiled;
  try {
    const options = {i: RE2JS.CASE_INSENSITIVE, m: RE2JS.MULTILINE, s: RE2JS.DOTALL};
    compiled = RE2JS.compile(pattern, [...flags].reduce((bits, flag) => bits | options[flag], 0));
  } catch {
    // Compiler messages may contain the supplied pattern. Keep them private.
    throw Error('Invalid body regex: use RE2 syntax without backreferences or lookaround');
  }
  if (compiled.programSize() > 4096) throw Error('Invalid body regex: compiled pattern is too large');
  return compiled;
}

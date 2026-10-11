// A seed theme is one plain CSS file that the seed's app already serves:
// `:root { --rer-*: value }` tokens plus `@font-face` rules for font files the
// app serves itself. Base frames link that file; this module is the one place
// that reads it, refuses anything outside the grammar and checks contrast.
const colour = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const family = String.raw`(?:"[A-Za-z0-9 _-]+"|'[A-Za-z0-9 _-]+'|[A-Za-z][A-Za-z0-9 _-]*)`;
const stack = new RegExp(String.raw`^${family}(?:\s*,\s*${family})*$`);
const assetPath = /^\/(?!.*\/\/)(?!.*\/\.)[A-Za-z0-9._~/-]{1,200}$/;
const url = /^url\(\s*(["']?)([^"')]+)\1\s*\)$/;

export const themeTokens = Object.freeze({
 '--rer-page': 'colour', '--rer-surface': 'colour', '--rer-text': 'colour', '--rer-muted': 'colour',
 '--rer-border': 'colour', '--rer-focus': 'colour', '--rer-accent': 'colour', '--rer-accent-text': 'colour',
 '--rer-link': 'colour', '--rer-font-body': 'stack', '--rer-font-heading': 'stack', '--rer-radius': 'radius', '--rer-logo': 'logo',
});
const required = ['--rer-page', '--rer-surface', '--rer-text', '--rer-muted', '--rer-border', '--rer-focus'];

// WCAG 2.2: 4.5:1 for text, 3:1 for focus indicators and control boundaries.
const pairs = [
 ['--rer-text', '--rer-page', 4.5], ['--rer-text', '--rer-surface', 4.5], ['--rer-muted', '--rer-surface', 4.5], ['--rer-muted', '--rer-page', 4.5],
 ['--rer-link', '--rer-surface', 4.5], ['--rer-accent-text', '--rer-accent', 4.5],
 ['--rer-focus', '--rer-page', 3], ['--rer-focus', '--rer-surface', 3], ['--rer-border', '--rer-surface', 3],
];

const faceDescriptors = {
 'font-family': value => new RegExp(`^${family}$`).test(value),
 'font-style': value => /^(?:normal|italic|oblique)$/.test(value),
 'font-weight': value => /^(?:normal|bold|\d{1,3}(?:\s+\d{1,3})?)$/.test(value),
 'font-display': value => /^(?:auto|block|swap|fallback|optional)$/.test(value),
 'unicode-range': value => /^U\+[0-9A-F?]{1,6}(?:-[0-9A-F]{1,6})?(?:\s*,\s*U\+[0-9A-F?]{1,6}(?:-[0-9A-F]{1,6})?)*$/i.test(value),
 'size-adjust': value => /^\d{1,3}(?:\.\d+)?%$/.test(value),
 'ascent-override': value => /^(?:normal|\d{1,3}(?:\.\d+)?%)$/.test(value),
 'descent-override': value => /^(?:normal|\d{1,3}(?:\.\d+)?%)$/.test(value),
 'line-gap-override': value => /^(?:normal|\d{1,3}(?:\.\d+)?%)$/.test(value),
 src: null,
};

function asset(value, extensions, what) {
 const path = url.exec(value)?.[2];
 if (!path || !assetPath.test(path) || !extensions.test(path)) throw Error(`${what} must be url("/path") to a file the app serves (${extensions.source.match(/\w+/g).join(', ')}).`);
 return path;
}

function declarations(body, where) {
 const result = [];
 for (const part of body.split(';')) {
  if (!part.trim()) continue;
  const index = part.indexOf(':');
  if (index < 0) throw Error(`${where}: expected "name: value" in "${part.trim().slice(0, 60)}".`);
  const name = part.slice(0, index).trim(), value = part.slice(index + 1).trim().replace(/\s+/g, ' ');
  if (!name || !value) throw Error(`${where}: empty declaration.`);
  if (result.some(entry => entry[0] === name)) throw Error(`${where}: ${name} is declared twice.`);
  result.push([name, value]);
 }
 return result;
}

function luminance(hex) {
 const full = hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex;
 const [r, g, b] = [1, 3, 5].map(i => parseInt(full.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
 return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
 const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
 return (high + 0.05) / (low + 0.05);
}

// Returns {tokens, faces, assets}; throws one error naming every problem.
export function readTheme(css, file = 'rer-theme.css') {
 if (typeof css !== 'string' || css.length > 64 * 1024) throw Error(`${file}: a theme is a CSS file of at most 64 KiB.`);
 if (/[\\<]/.test(css)) throw Error(`${file}: escapes and "<" are not part of the theme grammar.`);
 let rest = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
 if (rest.includes('/*')) throw Error(`${file}: unterminated comment.`);
 const tokens = {}, faces = [], assets = new Set();
 while ((rest = rest.trim())) {
  const block = /^(:root|@font-face)\s*\{([^{}]*)\}/.exec(rest);
  if (!block) throw Error(`${file}: only :root { --rer-* } and @font-face { } blocks are allowed, found "${rest.slice(0, 40)}".`);
  rest = rest.slice(block[0].length);
  if (block[1] === ':root') {
   for (const [name, value] of declarations(block[2], ':root')) {
    const kind = themeTokens[name];
    if (!kind) throw Error(`${file}: ${name} is not a theme token. Use ${Object.keys(themeTokens).join(', ')}.`);
    if (Object.hasOwn(tokens, name)) throw Error(`${file}: ${name} is declared twice.`);
    if (kind === 'colour' && !colour.test(value)) throw Error(`${file}: ${name} must be a #rgb or #rrggbb colour.`);
    if (kind === 'stack' && !stack.test(value)) throw Error(`${file}: ${name} must be a font stack of family names.`);
    if (kind === 'radius' && !/^\d{1,2}(?:\.\d+)?(?:px|rem)$/.test(value)) throw Error(`${file}: ${name} must be a length in px or rem.`);
    if (kind === 'logo') assets.add(asset(value, /\.(?:svg|png|webp)$/, name));
    tokens[name] = value;
   }
  } else {
   const face = Object.fromEntries(declarations(block[2], '@font-face'));
   for (const [name, value] of Object.entries(face)) {
    if (!Object.hasOwn(faceDescriptors, name)) throw Error(`${file}: @font-face ${name} is not supported.`);
    if (name !== 'src' && !faceDescriptors[name](value)) throw Error(`${file}: @font-face ${name} "${value}" is not valid.`);
   }
   if (!face['font-family'] || !face.src) throw Error(`${file}: @font-face needs font-family and src.`);
   for (const source of face.src.split(',').map(value => value.trim())) {
    if (/^local\(\s*(["'])[A-Za-z0-9 _-]+\1\s*\)$/.test(source)) continue;
    const [location, format] = source.split(/\s+(?=format\()/);
    if (format && !/^format\(\s*(["'])(?:woff2|woff|truetype|opentype)\1\s*\)$/.test(format)) throw Error(`${file}: @font-face format ${format} is not supported.`);
    assets.add(asset(location, /\.(?:woff2|woff|ttf|otf)$/, '@font-face src'));
   }
   faces.push(face);
  }
 }
 const problems = [];
 for (const name of required) if (!tokens[name]) problems.push(`declare ${name}`);
 if (Boolean(tokens['--rer-accent']) !== Boolean(tokens['--rer-accent-text'])) problems.push('declare --rer-accent and --rer-accent-text together');
 const value = name => tokens[name] ?? (name === '--rer-link' ? tokens['--rer-text'] : undefined);
 for (const [foreground, background, minimum] of pairs) {
  if (!value(foreground) || !value(background)) continue;
  const ratio = contrast(value(foreground), value(background));
  if (ratio < minimum) problems.push(`${foreground} ${value(foreground)} on ${background} ${value(background)} is ${ratio.toFixed(2)}:1, below ${minimum}:1`);
 }
 if (problems.length) throw Error(`${file}: ${problems.join('; ')}.`);
 return Object.freeze({ tokens: Object.freeze(tokens), faces: Object.freeze(faces), assets: Object.freeze([...assets]) });
}

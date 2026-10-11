import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyCopies} from '../scripts/edition-authoring/base-copies.mjs';
import {spawnSync} from 'node:child_process';
import {lstat, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicDocuments = new Set([
  'README.md', 'CONTRACT.md', 'ACCEPTANCE.md', 'HANDOVER.md', 'OPERATIONS.md',
  'AGENTS.md', 'CLAUDE.md', 'TARGET.md', 'seed.json', 'OPERATIONS.json',
  'rer-project.json',
]);
const chars = (...points) => String.fromCodePoint(...points);
const taskPrefix = chars(84, 45);
const decisionPrefix = chars(79, 68, 45);
const internalTerm = chars(102, 108, 101, 101, 116);
const internalRole = chars(97, 103, 101, 110, 116);
const restrictedPhrase = chars(116, 97, 115, 107, 45, 111, 119, 110, 101, 100);
const markdownExtension = chars(46, 109, 100);
const privateRoots = [
  chars(47, 85, 115, 101, 114, 115, 47),
  chars(47, 104, 111, 109, 101, 47),
  chars(47, 112, 114, 105, 118, 97, 116, 101, 47),
  chars(47, 86, 111, 108, 117, 109, 101, 115, 47),
  chars(47, 116, 109, 112, 47),
  chars(47, 118, 97, 114, 47),
];
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const taskIds = new RegExp(`\\b(?:${taskPrefix}\\d{3,}|${decisionPrefix}\\d{2,})\\b`, 'iu');
const privatePath = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${privateRoots.map(escapePattern).join('|')})[^\\s"'<>]+`, 'iu');
const standaloneTerm = (word) => new RegExp(`(?<![\\p{L}\\p{N}_${word === internalRole ? '.' : ''}-])${word}s?(?!(?:${escapePattern(markdownExtension)}|[\\p{L}\\p{N}_-]))`, 'iu');
const phrasePattern = new RegExp(escapePattern(restrictedPhrase), 'iu');
const forbidden = [
  ['planning identifier', taskIds],
  ['private absolute path', privatePath],
  ['internal repository reference', standaloneTerm(internalTerm)],
  ['internal role reference', standaloneTerm(internalRole)],
];
for (const [pattern, examples] of [
  [taskIds, [`${taskPrefix}123`, `${taskPrefix.toLowerCase()}123`, `${decisionPrefix}12`, `${decisionPrefix.toLowerCase()}12`]],
  [privatePath, [`${privateRoots[0]}sample`, `${privateRoots[0].toUpperCase()}sample`]],
  [standaloneTerm(internalTerm), [internalTerm, internalTerm.toUpperCase()]],
  [standaloneTerm(internalRole), [internalRole, internalRole.toUpperCase()]],
]) {
  for (const example of examples) assert.match(example, pattern, 'the source-language guard must detect case variants');
}
assert.doesNotMatch(`${internalRole.toUpperCase()}s${markdownExtension}`, standaloneTerm(internalRole));
const textExtensions = new Set([
  '.md', '.mdx', '.txt', '.json', '.jsonc', '.yaml', '.yml', '.toml', '.xml', '.svg',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.mts', '.cts', '.css', '.html',
  '.sql', '.sh', '.bash', '.py', '.conf', '.ini', '.example',
]);
const documentExtensions = new Set(['.md', '.mdx', '.txt', '.json', '.jsonc', '.yaml', '.yml', '.toml']);
const excludedDirectories = new Set([
  '.git', 'node_modules', 'dist', '.wrangler', '.tanstack', '.seed', '.cache',
  '.output', 'coverage', 'data', 'captures', 'capture', 'archives', 'archive',
]);
const appliedMigrations = new Set([
  'migrations/0001_uptime.sql', 'migrations/0002_manual_slots.sql',
  'migrations/0003_runner_contact.sql', 'migrations/0004_heartbeat_authority.sql',
  'migrations/0005_operator_auth.sql', 'migrations/0006_heartbeat_limits.sql',
]);
const safeRelative = (path) => typeof path === 'string' && path.length > 0
  && !path.startsWith('/') && !path.includes('\\')
  && !path.split('/').some(part => ['', '.', '..'].includes(part));
const eligible = (path) => safeRelative(path)
  && !path.split('/').some(part => excludedDirectories.has(part))
  && !/^\.(?:env|dev\.vars)/u.test(path.split('/').at(-1))
  && (textExtensions.has(extname(path).toLowerCase())
    || ['LICENSE', 'Dockerfile', 'Makefile', '.gitignore', '.gitattributes', '.npmrc'].includes(path.split('/').at(-1)));

function git(directory, args, input) {
  const result = spawnSync('git', ['-C', directory, ...args], {
    input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || ![0, 1].includes(result.status)) throw new Error('Source inventory unavailable.');
  return result;
}

export function sourceFiles(directory) {
  // Include new files before a commit, but never inspect ignored runtime data,
  // even if an ignored path was previously added to Git explicitly.
  const inventory = git(directory, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  if (inventory.status !== 0) throw new Error('Source inventory unavailable.');
  const candidates = [...new Set(inventory.stdout.split('\0').filter(eligible))].sort();
  if (!candidates.length) return [];
  const ignored = new Set(git(directory, ['check-ignore', '--no-index', '-z', '--stdin'],
    `${candidates.join('\0')}\0`).stdout.split('\0').filter(Boolean));
  return candidates.filter(path => !ignored.has(path));
}

async function vendoredFiles(directory) {
  // Use the maintained exact-byte copy inventory for every exported Base tree.
  // Edition-owned and modified files retain the ordinary language rules.
  const result = verifyCopies(directory, {record: 'base-copies.json', offline: true});
  assert.equal(result.ok, true, 'Recorded Base source bytes must match before exclusion');
  const record = JSON.parse(await readFile(resolve(directory, 'base-copies.json'), 'utf8'));
  return new Set(record.copies.flatMap(copy => Object.keys(copy.files)));
}

export async function auditSource(directory, files = sourceFiles(directory)) {
  const vendored = await vendoredFiles(directory, files);
  const failures = [];
  let inspected = 0;
  for (const relative of publicDocuments) {
    if (!files.includes(relative)) failures.push(`${JSON.stringify(relative)}: required public document missing`);
  }
  for (const relative of files) {
    if (!eligible(relative) || appliedMigrations.has(relative) || vendored.has(relative)) continue;
    const target = resolve(directory, relative);
    let stat;
    try { stat = await lstat(target); } catch (error) {
      if (error.code === 'ENOENT') {
        if (publicDocuments.has(relative)) failures.push(`${JSON.stringify(relative)}: required public document missing`);
        continue; // A tracked deletion is not current source.
      }
      throw new Error('Source file unavailable.');
    }
    if (!stat.isFile()) {
      failures.push(`${JSON.stringify(relative)}: source is not a regular file`);
      continue;
    }
    const bytes = await readFile(target);
    if (bytes.includes(0)) continue;
    let contents;
    try { contents = new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
    catch { continue; } // Binary assets are outside this text audit.
    inspected += 1;
    if (phrasePattern.test(relative) || phrasePattern.test(contents)) {
      failures.push(`${JSON.stringify(relative)}: restricted source phrase`);
    }
    // Portable fixture payloads are protocol data; public documentation and
    // manifests retain their separate private-path and internal-reference rules.
    if (publicDocuments.has(relative) || (!relative.startsWith('tests/')
      && documentExtensions.has(extname(relative).toLowerCase()))) {
      for (const [label, pattern] of forbidden) {
        if (pattern.test(contents)) failures.push(`${JSON.stringify(relative)}: ${label}`);
      }
    }
  }
  return {inspected, failures};
}

export async function selfTest() {
  const temporaryRoot = resolve(root, '..', 'tmp');
  await mkdir(temporaryRoot, {recursive: true});
  const scratch = await mkdtemp(join(temporaryRoot, 'source-language-'));
  try {
    const fixtures = new Map([
      ['edition.json', JSON.stringify({components: [{id: 'runeditrun/base', source: {
        origin: {repository: '.', paths: ['modules/example.mjs', 'operations/operations.mjs', 'edition-authoring/cli.mjs']},
        mappings: [{path: 'src/base/modules', originPath: 'modules'}, {path: 'scripts/operations.mjs', originPath: 'operations/operations.mjs'}, {path: 'scripts/edition-authoring', originPath: 'edition-authoring'}],
      }}, {id: 'runeditrun/onboarding', source: {
        paths: ['scripts/base-onboarding'],
        origin: {repository: '.', paths: ['onboarding']},
      }}]})],
      ['.gitignore', 'ignored/\n'],
      ['src/product.ts', restrictedPhrase],
      ['src/uppercase.ts', restrictedPhrase.toUpperCase()],
      ['src/mixed.ts', `${restrictedPhrase.slice(0, 1).toUpperCase()}${restrictedPhrase.slice(1)}`],
      ['tests/example.mjs', restrictedPhrase.toUpperCase()],
      ['tests/lowercase.mjs', restrictedPhrase],
      ['tests/mixed.mjs', `${restrictedPhrase.slice(0, 1).toUpperCase()}${restrictedPhrase.slice(1)}`],
      ['runners/example.mjs', `prefix${restrictedPhrase.slice(0, 1).toUpperCase()}${restrictedPhrase.slice(1)}suffix`],
      ['public/example.js', restrictedPhrase],
      ['scripts/example.mjs', restrictedPhrase],
      ['README.md', `${restrictedPhrase}\n${taskPrefix}123\n${privateRoots[0]}sample\n${internalTerm}\n${internalRole}`],
      ['extra.json', JSON.stringify({description: restrictedPhrase})],
      ['src/base/modules/example.mjs', restrictedPhrase],
      ['src/base/modules/original.mjs', restrictedPhrase],
      ['scripts/operations.mjs', restrictedPhrase],
      ['scripts/edition-authoring/cli.mjs', restrictedPhrase],
      ['scripts/base-onboarding/example.mjs', restrictedPhrase],
      ...[...appliedMigrations].map(path => [path, restrictedPhrase]),
      ['migrations/0008_new.sql', restrictedPhrase],
      ['ignored/private.json', restrictedPhrase],
      ['data/private.json', restrictedPhrase],
      ['captures/private.json', restrictedPhrase],
      ['archives/private.json', restrictedPhrase],
      ['.env.example', restrictedPhrase],
      ['public/image.png', Buffer.from(restrictedPhrase)],
      ['public/binary.js', Buffer.concat([Buffer.from([0]), Buffer.from(restrictedPhrase)])],
      ['tests/protocol.mjs', `const example = '${privateRoots[4]}portable'; const ${internalRole} = new http.Agent(); // user-${internalRole}`],
      ['tests/fixtures/protocol.json', JSON.stringify({path: `${privateRoots[4]}portable`, field: internalRole})],
      ['docs/protocol.md', `user-${internalRole}; https-proxy-${internalRole}; http.${internalRole[0].toUpperCase()}${internalRole.slice(1)}; ${internalRole.toUpperCase()}s${markdownExtension}`],
    ]);
    for (const relative of publicDocuments) {
      if (!fixtures.has(relative)) fixtures.set(relative, 'Public product documentation.');
    }
    for (const [relative, contents] of fixtures) {
      await mkdir(dirname(resolve(scratch, relative)), {recursive: true});
      await writeFile(resolve(scratch, relative), contents);
    }
    assert.equal(git(scratch, ['init', '-q']).status, 0, 'Fixture repository initialization failed');
    assert.equal(git(scratch, ['add', 'src/product.ts', 'tests/example.mjs']).status, 0, 'Fixture source indexing failed');
    assert.equal(git(scratch, ['add', '-f', 'ignored/private.json']).status, 0, 'Ignored fixture indexing failed');
    const copiedPaths = ['src/base/modules/example.mjs','scripts/operations.mjs','scripts/edition-authoring/cli.mjs','scripts/base-onboarding/example.mjs'];
    await writeFile(join(scratch,'base-copies.json'),JSON.stringify({schemaVersion:1,repository:'.',copies:copiedPaths.map(path=>({path,originPath:path,revision:'0'.repeat(40),files:{[path]:createHash('sha256').update(fixtures.get(path)).digest('hex')}}))}));
    const files = sourceFiles(scratch);
    assert.ok(files.includes('src/product.ts') && files.includes('tests/example.mjs') && files.includes('public/example.js'), 'Both indexed and new source must be audited');
    assert.ok(!files.includes('ignored/private.json') && !files.includes('data/private.json'), 'Private data must be excluded before reads');
    const {failures} = await auditSource(scratch, files);
    assert.ok(!failures.some(failure => failure.startsWith('"scripts/base-onboarding/example.mjs"')), 'Only the declared Base onboarding copy is exempt');
    const expectedPhrasePaths = [
      'src/product.ts', 'src/uppercase.ts', 'src/mixed.ts',
      'tests/example.mjs', 'tests/lowercase.mjs', 'tests/mixed.mjs', 'runners/example.mjs', 'public/example.js',
      'scripts/example.mjs', 'README.md', 'extra.json', 'src/base/modules/original.mjs', 'migrations/0008_new.sql',
    ];
    const expected = expectedPhrasePaths.map(path => `${JSON.stringify(path)}: restricted source phrase`);
    for (const [label] of forbidden) expected.push(`"README.md": ${label}`);
    assert.deepEqual(failures.sort(), expected.sort(), 'Audit must detect all source cases and preserve only the declared exclusions');
    assert.ok(!failures.join('\n').includes(restrictedPhrase), 'Diagnostics must not disclose matching content');
    console.log('Source-language self-test passed: indexed/new source, case variants, exact Base and onboarding provenance, immutable migrations, and private-data exclusions.');
  } finally {
    await rm(scratch, {recursive: true, force: true});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === '--self-test') await selfTest();
    else {
      const {inspected, failures} = await auditSource(root);
      if (failures.length) {
        console.error(`Source-language guard failed:\n${failures.join('\n')}`);
        process.exitCode = 1;
      } else console.log(`Source-language guard passed for ${inspected} source files, documents and manifests.`);
    }
  } catch {
    console.error('Source-language guard could not complete the audit.');
    process.exitCode = 1;
  }
}

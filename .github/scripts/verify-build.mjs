import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const configPath = '.wrangler/deploy/config.json';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const allowed = path => path === configPath || path.startsWith('dist/');
const safe = path => typeof path === 'string' && !path.includes('\\') && !path.includes('\0') && path.split('/').every(part => part && part !== '.' && part !== '..');

function identity() {
 assert.equal(process.env.CI, 'true', 'Shared verification builds require CI=true');
 const { GITHUB_SHA: sha, GITHUB_RUN_ID: runId, GITHUB_RUN_ATTEMPT: runAttempt } = process.env;
 assert.match(sha ?? '', /^[a-f0-9]{40}$/);
 assert.match(runId ?? '', /^[1-9][0-9]*$/);
 assert.match(runAttempt ?? '', /^[1-9][0-9]*$/);
 const git = value => execFileSync('git', ['rev-parse', value], { cwd: root, encoding: 'utf8' }).trim();
 const source = { sha: git('HEAD'), tree: git('HEAD^{tree}') };
 assert.equal(source.sha, sha, 'Shared verification build requires the workflow checkout SHA');
 return { source, workflow: { sha, runId, runAttempt } };
}

async function regular(path) {
 const status = await lstat(path);
 assert.ok(status.isFile() && !status.isSymbolicLink(), `Expected a regular file: ${path}`);
 return readFile(path);
}

async function outputFiles() {
 const files = {};
 for (const path of ['dist/server', 'dist/client', '.wrangler', '.wrangler/deploy']) {
  const status = await lstat(join(root, path));
  assert.ok(status.isDirectory() && !status.isSymbolicLink(), `Expected an output directory: ${path}`);
 }
 async function walk(path) {
  const status = await lstat(join(root, path));
  assert.ok(!status.isSymbolicLink(), `Shared output contains a symbolic link: ${path}`);
  if (status.isDirectory()) {
   for (const entry of (await readdir(join(root, path))).sort()) await walk(`${path}/${entry}`);
  } else {
   assert.ok(status.isFile() && safe(path) && allowed(path), `Invalid shared output: ${path}`);
   files[path] = hash(await readFile(join(root, path)));
  }
 }
 await walk('dist');
 await walk(configPath);
 assert.ok(files['dist/server/wrangler.json'], 'Production Worker configuration is missing');
 assert.ok(Object.keys(files).some(path => path.startsWith('dist/client/')), 'Production client output is empty');
 return files;
}

// tarfile resolves PAX names before these checks. Reject every link, device,
// duplicate and unexpected path, and verify the archived bytes before extracting.
const archiveProgram = `
import hashlib, json, os, pathlib, shutil, sys, tarfile
archive, root, mode = sys.argv[1:]
expected = json.load(sys.stdin)
with tarfile.open(archive, 'r:gz') as bundle:
    seen, files = set(), set()
    members = bundle.getmembers()
    for item in members:
        name = item.name
        parts = name.split('/')
        assert name and all(p and p not in ('.', '..') for p in parts) and '\\\\' not in name, 'Unsafe archive path'
        assert name not in seen, 'Duplicate archive entry'
        seen.add(name)
        assert item.isdir() or item.isfile(), 'Archive links and special files are forbidden'
        if item.isdir():
            assert name == 'dist' or name.startswith('dist/'), 'Unexpected archive directory'
        else:
            assert name in expected, 'Unexpected archive file'
            with bundle.extractfile(item) as stream:
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            assert digest == expected[name], 'Archived output digest mismatch'
            files.add(name)
    assert files == set(expected), 'Archive file set mismatch'
    if mode == 'restore':
        for item in members:
            target = pathlib.Path(root, item.name)
            if item.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(item) as source, target.open('xb') as output:
                    shutil.copyfileobj(source, output)
                os.chmod(target, item.mode & 0o777)
`;
function archive(directory, files, mode = 'check') {
 execFileSync('python3', ['-I', '-c', archiveProgram, join(directory, 'build.tar.gz'), root, mode], { input: JSON.stringify(files), stdio: ['pipe', 'inherit', 'inherit'] });
}

async function load(directory) {
 const expected = identity();
 const manifest = JSON.parse(await regular(join(directory, 'build.json')));
 assert.equal(manifest.version, 1, 'Unknown shared build format');
 assert.deepEqual(manifest.source, expected.source, 'Shared build source mismatch');
 assert.deepEqual(manifest.workflow, expected.workflow, 'Shared build workflow mismatch');
 assert.ok(manifest.files && typeof manifest.files === 'object' && !Array.isArray(manifest.files), 'Missing shared file digests');
 for (const [path, digest] of Object.entries(manifest.files)) {
  assert.ok(safe(path) && allowed(path), `Invalid manifest path: ${path}`);
  assert.match(digest, /^[a-f0-9]{64}$/);
 }
 assert.equal(hash(await regular(join(directory, 'build.tar.gz'))), manifest.sha256, 'Shared archive digest mismatch');
 return manifest;
}

export async function assertSharedBuild(directory) {
 const manifest = await load(resolve(directory));
 assert.deepEqual(await outputFiles(), manifest.files, 'Restored production output differs from the shared build');
}

async function create(directory) {
 const manifest = { version: 1, ...identity(), files: await outputFiles() };
 await mkdir(directory, { recursive: true });
 for (const name of ['build.json', 'build.tar.gz']) {
  assert.equal(await lstat(join(directory, name)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }), false, `Bundle already exists: ${name}`);
 }
 execFileSync('tar', ['--create', '--gzip', '--format=posix', '--hard-dereference', '--file', join(directory, 'build.tar.gz'), '--directory', root, 'dist', configPath], { stdio: 'inherit' });
 archive(directory, manifest.files);
 assert.deepEqual(await outputFiles(), manifest.files, 'Production output changed while bundling');
 manifest.sha256 = hash(await regular(join(directory, 'build.tar.gz')));
 await writeFile(join(directory, 'build.json'), JSON.stringify(manifest) + '\n', { flag: 'wx' });
}

async function restore(directory) {
 const manifest = await load(directory);
 archive(directory, manifest.files);
 for (const path of ['dist', '.wrangler', '.wrangler/deploy']) {
  const status = await lstat(join(root, path)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (status) assert.ok(status.isDirectory() && !status.isSymbolicLink(), `Unsafe restore directory: ${path}`);
 }
 await rm(join(root, 'dist'), { recursive: true, force: true });
 await rm(join(root, configPath), { force: true });
 archive(directory, manifest.files, 'restore');
 await assertSharedBuild(directory);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const [mode, target, ...extra] = process.argv.slice(2);
 assert.ok(['create', 'restore', 'check'].includes(mode) && target && !extra.length, 'Usage: verify-build.mjs create|restore|check DIRECTORY');
 const directory = resolve(target);
 assert.ok(['dist', '.wrangler'].every(path => directory !== resolve(root, path) && !directory.startsWith(resolve(root, path) + '/')), 'Bundle must be outside production output and Wrangler state');
 await ({ create, restore, check: assertSharedBuild })[mode](directory);
 console.log(`Shared verification build ${mode} passed`);
}

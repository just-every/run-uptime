import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { git } from './source.mjs';
import { sha256 } from './catalogue.mjs';

// Read the checked Git blobs directly. export-ignore/export-subst attributes
// cannot silently remove or change bytes after publication inspection.
export function sourceTree(source, tree) {
  mkdirSync(tree);
  for (const [path, entry] of source.entries) {
    // Git control paths can alias .git on case-insensitive filesystems. Never
    // materialize source-supplied configuration before initializing an export.
    if (path.split('/').some(part => part.normalize('NFC').replace(/\p{Cf}/gu, '').toLowerCase().replace(/[ .]+$/, '') === '.git'))
      throw Error('Public export cannot contain Git control paths');
    if (!['100644', '100755'].includes(entry.mode) || entry.type !== 'blob') throw Error('Public export requires ordinary committed files');
    const target = resolve(tree, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source.bytes(path), { flag: 'wx', mode: entry.mode === '100755' ? 0o755 : 0o644 });
  }
  return tree;
}

export function releaseMessage(source) {
  const notes = source.release.publicReleaseNotes;
  if (notes !== undefined && (typeof notes !== 'string' || !notes.trim())) throw Error('Public release notes must be nonempty text');
  return source.tag + (notes ? `\n\n${notes.trim()}` : '');
}

export function annotate(repo, source, commit, name = source.tag) {
  git(repo, '-c', 'user.name=Run Edit Run', '-c', 'user.email=releases@runeditrun.invalid', '-c', 'core.hooksPath=/dev/null',
    'tag', '-a', name, commit, '-m', releaseMessage(source));
}

export function cleanHistory(source, temporary, tagged = false) {
  const tree = sourceTree(source, resolve(temporary, 'clean-source'));
  git(tree, 'init', '-q', '-b', 'main');
  git(tree, 'add', '-f', '--all');
  git(tree, '-c', 'user.name=Run Edit Run', '-c', 'user.email=releases@runeditrun.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', releaseMessage(source));
  const commit = git(tree, 'rev-parse', 'HEAD').toString().trim();
  if (git(tree, 'rev-parse', 'HEAD^{tree}').toString().trim() !== source.tree) throw Error('Clean export changed source bytes');
  if (tagged) annotate(tree, source, commit);
  return { repo: tree, commit };
}

export function publicExport(source, temporary, output) {
  const tree = sourceTree(source, resolve(temporary, 'public-source'));
  const archive = resolve(output, 'public-source.tar');
  execFileSync('tar', ['-cf', archive, '-C', tree, '.'], { stdio: ['ignore', 'pipe', 'pipe'] });
  return { path: 'public-source.tar', sha256: sha256(readFileSync(archive)), format: 'tar', revision: source.commit };
}

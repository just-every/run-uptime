import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { sourceTree, releaseMessage } from './export.mjs';
import { publicGit, publicOid } from './public-git.mjs';

const repositoryUrl = /^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9_.-]*)\/([A-Za-z0-9][A-Za-z0-9_.-]*)$/i;
const identity = url => url.match(repositoryUrl)?.slice(1).join('/').toLowerCase().replace(/\.git$/, '');

export function publicDestination(onto, repository, repo) {
  if (typeof onto !== 'string' || onto.split('#').length !== 2) throw Error('--onto requires an explicit public repository branch');
  const [url, branch] = onto.split('#');
  if (!identity(url) || identity(url) !== identity(repository)) throw Error('--onto must match the declared publication repository');
  if (!branch || branch === 'HEAD' || branch.startsWith('-') || branch.startsWith('refs/')) throw Error('--onto requires a branch name');
  publicGit(repo, ['check-ref-format', `refs/heads/${branch}`]);
  return { url, branch, spec: onto, identity: identity(url) };
}

export function requirePublicDestination(destination) {
  // Reuse the scanner's strict HTTP/status/duplicate-key validation. Pending
  // destinations are deliberately not accepted by this release mode.
  const script = 'import sys; sys.path.insert(0, sys.argv[1]); from github_refs import GitHubResolver; sys.exit(0 if GitHubResolver().resolve(sys.argv[2]) == "public" else 1)';
  try {
    execFileSync('python3', ['-B', '-c', script, resolve(import.meta.dirname, '../../scripts/publish-check'), destination.identity],
      { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { throw Error('Public destination must exist and have confirmed public visibility'); }
}

export function remotePublicHead(repo, destination, tag) {
  const headRef = `refs/heads/${destination.branch}`, tagRef = `refs/tags/${tag}`;
  const lines = publicGit(repo, ['--git-dir=/dev/null', 'ls-remote', '--refs', '--', destination.url, headRef, tagRef]).toString().trim().split('\n').filter(Boolean);
  if (lines.length !== 1) throw Error('Public destination must have one unambiguous branch and no release tag');
  const fields = lines[0].split('\t');
  if (fields.length !== 2 || fields[1] !== headRef || !/^[0-9a-f]{40}$/.test(fields[0])) throw Error('Public destination branch is missing or ambiguous');
  return fields[0];
}

export function assertPublicTree(repo, commit, sourceTreeId) {
  if (publicOid(repo, 'rev-parse', `${commit}^{tree}`) !== sourceTreeId) throw Error('Public child changed the selected source tree');
}

export function publicChild(source, temporary, destination, parent, tagged) {
  const repo = sourceTree(source, resolve(temporary, 'public-child'));
  publicGit(repo, ['init', '-q', '--template=', '-b', destination.branch]);
  publicGit(repo, ['fetch', '--quiet', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', '--',
    destination.url, `refs/heads/${destination.branch}:refs/public-release/parent`]);
  if (publicOid(repo, 'rev-parse', 'refs/public-release/parent') !== parent ||
      publicOid(repo, 'cat-file', '-t', parent) !== 'commit' ||
      publicOid(repo, 'rev-parse', '--is-shallow-repository') !== 'false') throw Error('Public parent changed or is not a complete commit');
  // Store only selected source blobs; never copy or fetch private Git objects.
  // Index plumbing avoids clean filters and all export/working-tree attributes.
  const records = [];
  for (const [path, entry] of source.entries) {
    const oid = publicGit(repo, ['hash-object', '-w', '--stdin', '--no-filters'], source.bytes(path)).toString().trim();
    if (oid !== entry.oid) throw Error('Public source blob identity changed');
    records.push(`${entry.mode} ${oid}\t${path}\0`);
  }
  publicGit(repo, ['update-index', '-z', '--index-info'], Buffer.from(records.join('')));
  const tree = publicOid(repo, 'write-tree');
  if (tree !== source.tree) throw Error('Public child changed the selected source tree');
  const commit = publicGit(repo, ['commit-tree', tree, '-p', parent, '-F', '-'], Buffer.from(releaseMessage(source) + '\n')).toString().trim();
  publicGit(repo, ['update-ref', `refs/heads/${destination.branch}`, commit]);
  publicGit(repo, ['update-ref', '-d', 'refs/public-release/parent']);
  assertPublicTree(repo, commit, source.tree);
  if (publicOid(repo, 'rev-list', '--parents', '-n', '1', commit) !== `${commit} ${parent}`) throw Error('Public child must have exactly the pinned public parent');
  let tagObject = null;
  if (tagged) {
    publicGit(repo, ['tag', '-a', '--cleanup=verbatim', source.tag, commit, '-F', '-'], Buffer.from(releaseMessage(source) + '\n'));
    tagObject = publicOid(repo, 'rev-parse', `refs/tags/${source.tag}`);
  }
  return { repo, commit, parent, tagObject };
}

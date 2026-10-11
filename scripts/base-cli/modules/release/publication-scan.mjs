import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export function validatePublicationDestination(source, project, repository) {
  try {
    execFileSync('python3', ['-B', resolve(import.meta.dirname, '../../scripts/publish-check/destination.py'),
      '--repo', source.repo, '--ref', source.commit, '--project', project, '--repository', repository],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { throw Error('Publication destination must agree with the committed edition and project identities'); }
}

export function publicationScan(repo, ref, envFile, project, repository, publicBase) {
  try {
    return JSON.parse(execFileSync(process.execPath,
      [resolve(import.meta.dirname, '../../scripts/publish-check.mjs'), '--repo', repo, '--ref', ref,
        ...(publicBase ? ['--public-base', publicBase] : []), ...(project != null ? ['--project', project] : []), ...(repository != null ? ['--repository', repository] : []), ...(envFile ? ['--env-file', envFile] : [])],
      { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 }));
  } catch (error) {
    try { return JSON.parse(error.stdout); }
    catch { throw Error('Publication inspection did not produce a report'); }
  }
}

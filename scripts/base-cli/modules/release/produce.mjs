import { mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { inspectSource, newOutput, git, command } from './source.mjs';
import { catalogue, writeCatalogue, sha256, json } from './catalogue.mjs';
import { publicExport, cleanHistory, annotate, releaseMessage } from './export.mjs';
import { publicationScan, validatePublicationDestination } from './publication-scan.mjs';
import { publicDestination, requirePublicDestination, remotePublicHead, publicChild, assertPublicTree } from './public-child.mjs';
import { writePublishHandoff } from './publish-handoff.mjs';

export async function release({ repo, ref = 'HEAD', output, project, repository, dryRun = false, tag = false, cleanHistory: clean = false, envFile, onto }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(project ?? '')) throw Error('--project must be publisher/name');
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/i.test(repository ?? '')) throw Error('--repository must be a credential-free GitHub repository URL');
  if (onto !== undefined && clean) throw Error('--onto and --clean-history are mutually exclusive');
  const preview = dryRun || !tag;
  const source = inspectSource(repo, ref);
  validatePublicationDestination(source, project, repository);
  releaseMessage(source);
  if (typeof tag === 'string' && tag !== source.tag) throw Error('Requested tag must match the committed release version');
  const existing = git(source.repo, 'tag', '--list', source.tag).toString().trim();
  if (existing && tag && !dryRun) throw Error('Release tag already exists; choose a new committed version');
  // Validate metadata before installs or output writes.
  catalogue(source, project, repository, { verify: { status: 'PENDING' }, publishCheck: { status: 'PENDING' } }, preview);
  const destination = onto !== undefined ? publicDestination(onto, repository, source.repo) : null;
  let publicParent = null;
  if (destination) {
    requirePublicDestination(destination);
    publicParent = remotePublicHead(source.repo, destination, source.tag);
  }
  output = newOutput(source.repo, output);
  const temporary = mkdtempSync(resolve(tmpdir(), 'rer-release-'));
  let receipt;
  try {
    const checkout = resolve(temporary, 'seed');
    git(source.repo, 'clone', '--no-hardlinks', '--no-checkout', '--', source.repo, checkout);
    git(checkout, 'checkout', '--detach', source.commit);
    // Honour the seed's committed install policy. Base's native-build settings
    // are not interchangeable with pnpm 8's locked onlyBuiltDependencies.
    const install = await command('pnpm', ['install', '--frozen-lockfile'], checkout);
    const verify = install.status === 'PASS' ? await command('pnpm', ['run', 'verify'], checkout) : { status: 'FAIL', reason: 'frozen-install-failed', tests: 0, passed: 0, failed: 0 };
    // Release-only scale and capacity cases stay outside routine CI. The
    // committed seed script is an additional gate in previews and releases.
    if (verify.status === 'PASS' && JSON.parse(source.bytes('package.json')).scripts['verify:release']) {
      verify.release = await command('pnpm', ['run', 'verify:release'], checkout);
      if (verify.release.status !== 'PASS') {
        verify.status = 'FAIL'; verify.exitCode = verify.release.exitCode;
        verify.reason = 'release-verification-failed';
      }
    }
    if (git(checkout, 'status', '--porcelain', '--untracked-files=no').length) {
      verify.status = 'FAIL'; verify.reason = 'verify-changed-tracked-source';
    }
    // Explicit clean-history publication scans every byte and ref of the actual
    // parentless export. Ordinary releases retain the private full-history gate.
    const exported = destination ? publicChild(source, temporary, destination, publicParent, Boolean(tag))
      : clean ? cleanHistory(source, temporary, Boolean(tag)) : null;
    const scanRepo = exported?.repo ?? source.repo;
    const scanRef = exported?.commit ?? source.commit;
    let report = publicationScan(scanRepo, scanRef, envFile, project, repository, destination?.spec);
    if (!exported && tag && report.status === 'PASS') {
      // Stage the exact final annotation in the disposable clone before any
      // source tag or distributable artifact exists. Source history was scanned
      // above, including refs not transferred by a normal checkout clone.
      const staged = git(checkout, 'tag', '--list', source.tag).toString().trim();
      annotate(checkout, source, source.commit, staged ? `${source.tag}-publication-candidate` : source.tag);
      const annotations = publicationScan(checkout, source.commit, envFile, project, repository);
      report.annotationInspection = annotations;
      if (annotations.status !== 'PASS') {
        report.status = annotations.status;
        report.complete = annotations.complete;
        report.guarantees.historyScanned = annotations.complete;
        report.findings.push(...annotations.findings);
      }
    }
    if (destination) {
      assertPublicTree(exported.repo, exported.commit, source.tree);
      if (report.status === 'PASS' && (report.complete !== true || report.guarantees?.historyScanned !== true ||
        report.publicBase?.commit !== publicParent || report.source?.commit !== exported.commit)) {
        report.status = 'INCOMPLETE';
        report.complete = false;
        report.guarantees ??= {};
        report.guarantees.historyScanned = false;
      }
      // A successful scan cannot authorize a handoff against a different tip.
      requirePublicDestination(destination);
      if (remotePublicHead(exported.repo, destination, source.tag) !== publicParent) throw Error('Public destination changed during release');
    }
    writeFileSync(resolve(output, 'publish-check.json'), json(report), { flag: 'wx' });
    const gates = { verify, publishCheck: { status: report.status, findings: report.findings.length,
      reportSha256: sha256(json(report)) } };
    const passed = verify.status === 'PASS' && report.status === 'PASS';
    receipt = { schemaVersion: 1, status: passed ? (preview ? 'DRY_RUN' : 'RELEASED') : 'BLOCKED',
      dryRun, tagRequested: Boolean(tag), source: { commit: source.commit, tree: source.tree }, tag: { name: source.tag, created: false, pushed: false }, gates,
      publicationHistory: destination ? 'public-child' : clean ? 'parentless-export' : 'source-history',
      ...(destination ? { publicParent, publicDestination: { repository: destination.url, branch: destination.branch } } : {}),
      publicExport: null, siteRelease: null };
    // A blocked preview may prepare the site metadata/docs for local review.
    // Its provenance explicitly records blocked gates; it is never a release.
    const publicSource = exported ? { ...source, commit: exported.commit, publicTagStaged: Boolean(destination && tag) } : source;
    if (passed || preview) receipt.siteRelease = writeCatalogue(publicSource, output, catalogue(publicSource, project, repository, gates, preview));
    if (passed) {
      if (tag) {
        receipt.publicExport = publicExport(source, temporary, output);
        if (exported) {
          cpSync(exported.repo, resolve(output, 'public-git'), { recursive: true, errorOnExist: true });
          Object.assign(receipt.publicExport, { gitPath: 'public-git', commit: exported.commit, tree: source.tree,
            ...(destination ? { publicParent, tag: source.tag, tagObject: exported.tagObject, revision: exported.commit } : {}) });
        }
      }
      // Verification must not have changed the original or selected source.
      if (git(source.repo, 'status', '--porcelain', '--untracked-files=all').length) throw Error('Source changed during release');
      if (tag && !dryRun) {
        // Public-child writes every artifact before the last guard/source tag,
        // so a failed write or changed remote cannot leave a private tag.
        if (!destination) annotate(source.repo, source, source.commit);
        receipt.tag.created = true;
      }
    }
    if (passed && tag && destination) writePublishHandoff(output, destination, receipt);
    writeFileSync(resolve(output, 'release-receipt.json'), json(receipt), { flag: 'wx' });
    if (passed && destination) {
      requirePublicDestination(destination);
      if (remotePublicHead(exported.repo, destination, source.tag) !== publicParent) throw Error('Public destination changed before handoff');
      if (tag && !dryRun) annotate(source.repo, source, source.commit);
    }
    return receipt;
  } catch (error) {
    // No incomplete directory should be mistaken for a completed export.
    rmSync(output, { recursive: true, force: true });
    throw error;
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

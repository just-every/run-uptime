import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha256, json } from './catalogue.mjs';

const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
// A test command must not mask a failed command substitution with matching output.
const requireOutput = (command, expected) => `release_output=$(${command}) || exit 1\ntest "$release_output" = ${expected}`;

export function writePublishHandoff(output, destination, receipt) {
  const { commit, tree, tagObject } = receipt.publicExport;
  const parent = receipt.publicParent;
  const tag = receipt.tag.name;
  // Embedded identities and receipt digest bind the commands to this artifact,
  // including when pasted from an unrelated working directory.
  const script = [
    'set -eu',
    `artifact=${quote(output)}`,
    'cd -- "$artifact/public-git"',
    requireOutput(`node -e 'const fs=require("node:fs"),c=require("node:crypto"); process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$artifact/release-receipt.json"`, quote(sha256(json(receipt)))),
    requireOutput(`node -e 'const fs=require("node:fs"),c=require("node:crypto"); process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$artifact/publish-check.json"`, quote(receipt.gates.publishCheck.reportSha256)),
    requireOutput(`node -e 'const fs=require("node:fs"),c=require("node:crypto"); process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' "$artifact/public-git/.git/config"`, quote(sha256(readFileSync(resolve(output, 'public-git/.git/config'))))),
    '# Discard inherited Git overrides while keeping authentication in the environment.',
    'release_git() {',
    `  node -e ${quote('const cp=require("node:child_process"); const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith("GIT_") && k!=="GH_DEBUG" && k!=="DEBUG")); Object.assign(env,{GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:"/dev/null",GIT_NO_REPLACE_OBJECTS:"1",GIT_GRAFT_FILE:"/dev/null",GIT_TERMINAL_PROMPT:"0"}); const result=cp.spawnSync("git",["--no-replace-objects","-c","core.hooksPath=/dev/null","-c","core.useReplaceRefs=false","-c","push.followTags=false","-c","credential.helper=","-c","credential.helper=!gh auth git-credential",...process.argv.slice(1)],{env,stdio:"inherit"}); process.exit(result.status??1);')} -- "$@"`,
    '}',
    requireOutput('release_git rev-parse --show-toplevel', '"$artifact/public-git"'),
    requireOutput('release_git rev-parse HEAD', quote(commit)),
    requireOutput("release_git rev-parse 'HEAD^{tree}'", quote(tree)),
    requireOutput('release_git rev-list --parents -n 1 HEAD', quote(`${commit} ${parent}`)),
    requireOutput(`release_git cat-file -t ${quote(`refs/tags/${tag}`)}`, 'tag'),
    requireOutput(`release_git rev-parse ${quote(`refs/tags/${tag}`)}`, quote(tagObject)),
    requireOutput(`release_git rev-parse ${quote(`refs/tags/${tag}^{commit}`)}`, quote(commit)),
    requireOutput(`release_git ls-remote --refs -- ${quote(destination.url)} ${quote(`refs/heads/${destination.branch}`)} ${quote(`refs/tags/${tag}`)}`, quote(`${parent}\trefs/heads/${destination.branch}`)),
    `release_git push --atomic --no-follow-tags -- ${quote(destination.url)} ${quote(`${commit}:refs/heads/${destination.branch}`)} ${quote(`${tagObject}:refs/tags/${tag}`)}`,
  ].join('\n');
  writeFileSync(resolve(output, 'PUBLISH.md'), `# Publish the reviewed public child\n\nThe producer has not pushed anything. Review the receipt and publication report before running these commands. They publish exactly the public child and its annotated tag to the declared destination with one ordinary atomic push. A moved branch or existing tag requires a fresh release artifact; do not force the push. Authentication uses your existing GitHub CLI credentials.\n\n\`\`\`sh\n${script}\n\`\`\`\n`, { flag: 'wx' });
}

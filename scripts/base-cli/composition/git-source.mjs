import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function git(repo, args) {
  return execFileSync("git", ["--no-replace-objects", "-C", repo, ...args], {
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
export function commit(repo, ref = "HEAD") {
  if (typeof ref !== "string" || ref.startsWith("-"))
    throw new Error("Invalid Git ref");
  const sha = git(repo, ["rev-parse", "--verify", `${ref}^{commit}`])
    .toString()
    .trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Expected SHA-1 Git commit");
  return sha;
}
export function safePath(path) {
  if (
    typeof path !== "string" ||
    !path ||
    path.includes("\\") ||
    /[\x00-\x1f\x7f]/.test(path) ||
    path.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new Error(`Unsafe source or target: ${path}`);
  if (
    path
      .split("/")
      .some(
        (p) =>
          [
            ".git",
            ".seed",
            ".worktrees",
            "node_modules",
            "dist",
            ".output",
            ".wrangler",
            ".tanstack",
            "test-results",
            "playwright-report",
            "coverage",
            ".DS_Store",
          ].includes(p) ||
          /^\.env|^\.dev\.vars|\.(pem|key|p12|pfx|tsbuildinfo)$/.test(p),
      ) ||
    /(^|\/)(wrangler\.toml|wrangler\.local\.jsonc?|composition\.lock\.json)$/.test(
      path,
    )
  )
    throw new Error(`State or secret is not source: ${path}`);
  return path;
}
export function tree(repo, sha) {
  return git(repo, ["ls-tree", "-rz", "--full-tree", sha])
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      const header = line.slice(0, tab),
        path = line.slice(tab + 1);
      const [mode, type, oid] = header.split(" ");
      return { path, mode, type, oid };
    });
}
export function blob(repo, sha, path) {
  safePath(path);
  return git(repo, ["show", `${sha}:${path}`]);
}
export function json(repo, sha, path) {
  return JSON.parse(blob(repo, sha, path));
}
// Base's verification belongs in Base, rather than in each adopting seed.
export function testSource(path) {
  return path.split('/').some(part => ['test', 'tests', 'fixtures'].includes(part)) ||
    /(?:\.test\.[^/]+|(?:^|\/)test-manifest-support\.mjs$|(?:^|\/)(?:test-fixture|[^/]+-fixture)\.(?:mjs|cjs)$|(?:^|\/)(?:tests|test_[^/]+|[^/]*_tests)\.py|(?:^|\/)browser-(?:check|output)\.mjs)$/.test(path);
}
export function select(repo, sha, source, { includeTests = true } = {}) {
  safePath(source);
  const entries = tree(repo, sha).filter(
    (e) => (e.path === source || e.path.startsWith(`${source}/`)) &&
      (includeTests || !testSource(e.path)),
  );
  if (!entries.length) throw new Error(`Missing source: ${source}`);
  return entries.map((e) => {
    safePath(e.path);
    if (e.type !== "blob" || !["100644", "100755"].includes(e.mode))
      throw new Error(`Unsafe source mode: ${e.path}`);
    return {
      path: e.path,
      relative: e.path === source ? "" : e.path.slice(source.length + 1),
      bytes: git(repo, ["cat-file", "blob", e.oid]),
      mode: e.mode === "100755" ? 0o755 : 0o644,
    };
  });
}
export function familyManifest(repo, sha) {
  const data = json(repo, sha, "family.json");
  // Bootstrap validates only what is needed to locate immutable tooling.
  // The pinned exporter owns the complete schema and compatibility rules.
  if (
    typeof data?.base?.commit !== "string" ||
    !/^[a-f0-9]{40}$/.test(data.base.commit)
  )
    throw new Error("family.json needs an immutable base commit");
  return data;
}

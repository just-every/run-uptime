// Uptime's verification tasks read application inputs; only readme-journey reads
// a repository document (README.md, outside this allowlist). Contract parsing is
// covered by rer check and the site build; every light run checks the source lock.
// Revisit this dependency declaration when a task starts reading these documents.
const documents = new Set(['CONTRACT.md', 'ACCEPTANCE.md', 'CLAIMS.md', 'docs/CLAIMS.md', 'HANDOVER.md', 'STATUS.md']);
export async function reviewedReaders(files) {
 if (!files.length || !files.every(path => documents.has(path) || path === 'sources.lock.json'
  || /^(?:evidence|\.artifacts)\/.+\.(?:md|txt|png|jpe?g|pdf)$/.test(path))) return;
 return [];
}

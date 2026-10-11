import { StringDecoder } from 'node:string_decoder';
import { stripVTControlCharacters } from 'node:util';

const nodeFields = { tests: 'tests', pass: 'passed', fail: 'failed', skipped: 'skipped', cancelled: 'cancelled', todo: 'todo' };
const playwrightFields = { passed: 'passed', failed: 'failed', skipped: 'skipped', flaky: 'flaky', interrupted: 'interrupted', 'did not run': 'notRun' };

// Retain only bounded, complete lines and expose only numeric counters. These
// are reporter summaries, not individual test titles, retries or diagnostics.
export function testSummary() {
  const decoder = new StringDecoder('utf8');
  const counts = { tests: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 };
  let pending = '', oversized = false;

  function line(raw) {
    const text = stripVTControlCharacters(raw).replace(/\r$/, '');
    const node = /^(?:ℹ|#)[ \t]+(tests|pass|fail|skipped|cancelled|todo)[ \t]+(\d+)[ \t]*$/.exec(text);
    const playwright = /^ {2}(\d+) (passed \(\d+(?:\.\d+)?(?:ms|s|m|h|d)\)|failed|skipped|flaky|interrupted|did not run)[ \t]*$/.exec(text);
    if (!node && !playwright) return;
    const field = node ? nodeFields[node[1]] : playwrightFields[playwright[2].startsWith('passed ') ? 'passed' : playwright[2]];
    const value = Number(node ? node[2] : playwright[1]);
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger((counts[field] ?? 0) + value) ||
        (playwright && !Number.isSafeInteger(counts.tests + value))) return;
    if (value || field in counts) counts[field] = (counts[field] ?? 0) + value;
    // Node supplies its total explicitly; Playwright's outcome buckets are disjoint.
    if (playwright) counts.tests += value;
  }

  function consume(text) {
    for (const part of text.split(/(?<=\n)/)) {
      if (!oversized) {
        if (pending.length + part.length > 8192) { pending = ''; oversized = true; }
        else pending += part;
      }
      if (part.endsWith('\n')) {
        if (!oversized) line(pending.slice(0, -1));
        pending = ''; oversized = false;
      }
    }
  }

  return {
    write(bytes) { consume(decoder.write(bytes)); },
    finish() {
      consume(decoder.end());
      if (!oversized && pending) line(pending);
      pending = ''; oversized = false;
      return { ...counts };
    },
  };
}

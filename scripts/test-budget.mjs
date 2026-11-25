// Counts the repository's tests and fails over the cap in test-budget.json.
// One count per test registration (test() or it() from node:test), or one per
// entry script that registers none. Entry scripts are the commands of the
// package.json test:* groups that Verify runs. Nothing is folded.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const {scripts} = JSON.parse(read('package.json'));
const budget = JSON.parse(read('test-budget.json'));

const entries = Object.entries(scripts).filter(([name]) => name.startsWith('test:') && name !== 'test:base')
 .flatMap(([, command]) => command.split(/\s+&&\s+/)).map(command => /^node (tests\/\S+\.mjs)$/.exec(command)?.[1]);
if (entries.some(entry => !entry)) throw Error('A test:* command is not a plain `node tests/<entry>.mjs`; count it here before adding it');
if (new Set(entries).size !== entries.length) throw Error('An entry script is listed twice');

const registrations = text => text.match(/^\s*(?:test|it)(?:\.[a-z]+)?\(/gm)?.length ?? 0;
const count = entries.reduce((sum, entry) => sum + Math.max(1, registrations(read(entry))), 0);
const {cap, reason} = budget;
if (!Number.isInteger(cap) || cap < 1) throw Error('test-budget.json needs an integer cap');
if (cap > 200 && !(typeof reason === 'string' && reason.trim())) throw Error('A cap over 200 needs a written reason in test-budget.json');
console.log(`tests counted: ${count} (${entries.length} entry scripts), cap ${cap}`);
if (count > cap) {
 console.error(`Over the cap by ${count - cap}: delete or replace tests, or raise the cap in test-budget.json with a written reason`);
 process.exit(1);
}

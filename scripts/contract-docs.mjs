// Regenerate touched rows in Uptime's retained contract views without rewriting other clauses.
import {readFile,writeFile} from 'node:fs/promises';
import {parseContract} from '../src/base/seed-contract.mjs';

const [mode,option,selection,...extra]=process.argv.slice(2);
if(!['write','check'].includes(mode)||option!=='--clauses'||!selection||extra.length)throw Error('Use contract-docs.mjs write|check --clauses ID,ID');
const ids=new Set(selection.split(','));
const names=['CONTRACT.md','ACCEPTANCE.md','docs/CLAIMS.md'];
const original=Object.fromEntries(await Promise.all(names.map(async name=>[name,await readFile(name,'utf8')]))),output={...original};
const contract=parseContract(original['CONTRACT.md']);
const lines=original['CONTRACT.md'].split('\n');
const replaceLine=(file,predicate,value)=>{
 const rows=output[file].split('\n'),matches=rows.map((text,index)=>predicate(text)?index:-1).filter(index=>index>=0);
 if(matches.length!==1)throw Error(`${file}: expected one matching row, found ${matches.length}`);
 rows[matches[0]]=value;output[file]=rows.join('\n');
};
for(const id of ids){
 const clause=contract.clauses.find(row=>row.id===id);if(!clause)throw Error(`Unknown clause ${id}`);
 const cells=lines[clause.row-1].trim().slice(1,-1).split(/(?<!\\)\|/).map(cell=>cell.trim());
 const evidence=cells[4],gap=cells[5],acceptance=clause.text.split('**Acceptance evidence:**')[1]?.trim();
 if(!acceptance)throw Error(`${id}: no acceptance evidence section`);
 replaceLine('ACCEPTANCE.md',line=>line.startsWith(`- **${id} — `),`- **${id} — ${clause.title}. Status: ${clause.status}.** ${acceptance} Existing evidence: ${evidence}. Open scope: ${gap}`);
 replaceLine('docs/CLAIMS.md',line=>line.startsWith(`| ${id} |`),`| ${id} | ${clause.status} | ${gap||clause.text.split('**Acceptance evidence:**')[0].trim()} | ${evidence} |`);
}
// The source parser validates summary totals; write their canonical values from the same clauses.
for(const [label,rows] of [['Published',contract.clauses.filter(row=>row.kind==='published')],['Target and push further',contract.clauses.filter(row=>row.kind!=='published')],['All',contract.clauses]]){
 replaceLine('CONTRACT.md',line=>line.startsWith(`| ${label} |`),`| ${label} | ${['done','partial','missing'].map(status=>rows.filter(row=>row.status===status).length).join(' | ')} | ${rows.length} |`);
}
parseContract(output['CONTRACT.md']);
const changed=names.filter(name=>original[name]!==output[name]);
if(mode==='check'&&changed.length)throw Error(`Generated views are stale: ${changed.join(', ')}; regenerate the touched clauses`);
if(mode==='write')for(const name of changed)await writeFile(name,output[name]);
console.log(`Contract documents ${mode==='check'?'checked':'regenerated'} for ${[...ids].join(', ')}.`);

// Keep touched legacy clauses synchronized until ct's standard-format conversion lands.
import {readFileSync,writeFileSync} from 'node:fs';
const [command,flag,selection,...extra]=process.argv.slice(2);
if(!['write','check'].includes(command)||flag!=='--clauses'||!selection||extra.length)throw Error('Usage: contract-docs.mjs write|check --clauses ID[,ID]');
const ids=selection.split(',');
if(ids.some(id=>!/^\w+-\d+$/.test(id))||new Set(ids).size!==ids.length)throw Error('Name distinct clause IDs.');
const source=readFileSync('CONTRACT.md','utf8'),cells=line=>line.split(/(?<!\\)\|/).slice(1,-1).map(value=>value.trim());
const rows=new Map(source.split('\n').map(cells).filter(row=>/^`[A-Z]+-\d+`$/.test(row[0]??'')&&['done','partial','missing'].includes(row[3])).map(row=>[row[0].slice(1,-1),row]));
const counts=kind=>{const selected=[...rows.values()].filter(row=>kind==='all'||(row[2]==='published')===(kind==='published'));return ['done','partial','missing'].map(status=>selected.filter(row=>row[3]===status).length).concat(selected.length)};
let contract=source;
for(const [label,kind] of [['Published','published'],['Target and push further','target'],['All','all']]){
 const expression=new RegExp('^\\| '+label+' \\|[^\\n]+$','m');
 if(!expression.test(contract))throw Error('Contract summary is missing '+label);
 contract=contract.replace(expression,`| ${label} | ${counts(kind).join(' | ')} |`);
}
let acceptance=readFileSync('ACCEPTANCE.md','utf8'),claims=readFileSync('docs/CLAIMS.md','utf8');
for(const id of ids){
 const row=rows.get(id);if(!row)throw Error('No Status row for '+id);
 const clause=source.split('\n').find(line=>line.startsWith(`- **${id} — `));
 const evidence=clause?.split('**Acceptance evidence:** ')[1];if(!evidence)throw Error('No acceptance evidence for '+id);
 const prefix=`- **${id} — `,old=acceptance.split('\n').filter(line=>line.startsWith(prefix));if(old.length!==1)throw Error('Expected one acceptance entry for '+id);
 const rendered=`- **${id} — ${row[1]}. Status: ${row[3]}.** ${evidence} Existing evidence: ${row[4]}.${row[5]?' Open scope: '+row[5]:''}`;
 acceptance=acceptance.replace(old[0],rendered);
 const claim=`| ${id} | ${row[3]} | Contract evidence is cited here.${row[5]?' Remaining scope: '+row[5]:''} | ${row[4]} |`;
 const prior=claims.split('\n').filter(line=>line.startsWith(`| ${id} |`));if(prior.length>1)throw Error('Duplicate claim for '+id);
 claims=prior.length?claims.replace(prior[0],claim):claims.trimEnd()+'\n\n'+claim+'\n';
}
const files={'CONTRACT.md':contract,'ACCEPTANCE.md':acceptance,'docs/CLAIMS.md':claims};
for(const [file,content] of Object.entries(files))if(content!==readFileSync(file,'utf8')){
 if(command==='check')throw Error(file+' differs; regenerate the touched clauses.');
 writeFileSync(file,content);
}
console.log('Contract documents are current for '+ids.join(', ')+'.');

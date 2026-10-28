import {createServer} from 'vite';
import {readFile,writeFile} from 'node:fs/promises';
const server=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
try{
 const {nativeTools}=await server.ssrLoadModule('/src/domain/agent-door/tools.server.ts');
 const {resourceTemplates,notTools}=await server.ssrLoadModule('/src/domain/agent-door/index.server.ts');
 const fixture=JSON.parse(await readFile('tests/agent-door-journey.json','utf8'));
 const tools=nativeTools({}).map(({name,scope,readOnly,classes,clauses})=>({name,scope,readOnly,classes,clauses}));
 tools.push({name:'uptime.events.list',scope:'events:read',readOnly:true,classes:['standard'],clauses:['AUDIT-001']});tools.sort((a,b)=>a.name.localeCompare(b.name));
 const value={schema:'rer-agent-surface/1',seed:'uptime',specialist:'monitoring operator',tools,resources:resourceTemplates,notTools,...fixture};
 const text=JSON.stringify(value,null,2)+'\n';
 if(process.argv.includes('--check')){if(await readFile('agent-surface.json','utf8')!==text)throw Error('Agent surface is stale; run node scripts/generate-agent-surface.mjs');}
 else await writeFile('agent-surface.json',text);
}finally{await server.close()}

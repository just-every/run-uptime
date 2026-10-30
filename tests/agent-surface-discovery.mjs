// Replay the earlier discovery candidate through the current native MCP door.
// The newer CORE registry and callable adapters remain authoritative.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

export async function proveAgentSurfaceDiscovery({c,db,origin,monitorId}) {
 const contract=await readFile('CONTRACT.md','utf8');
 const table=contract.split('| Tool | Native action | Core clause metadata | Registry classes | Today |')[1].split('**Worker admissions')[0];
 const expected=table.split('\n').filter(line=>line.startsWith('| `uptime.')).map(line=>{
  const [name,,clauses,classes]=line.slice(1,-1).split('|').map(cell=>cell.trim());
  return {name:name.replaceAll('`',''),clauses:clauses.split(', ').sort(),classes:classes.split(', ').sort()};
 });
 assert.equal(expected.length,34,'the current native contract declares the full CORE surface');
 for(const version of ['2026-07-28','2025-11-25']){
  const response=await c.mcp('tools/list',{}, {version});
  assert.equal(response.status,200);
  const tools=response.result.tools;
  assert.deepEqual(tools.map(tool=>tool.name),expected.map(tool=>tool.name).sort(),'exactly the current contract tools, no aliases or omissions');
  for(const declaration of expected){
   const tool=tools.find(tool=>tool.name===declaration.name);
   assert.deepEqual([...tool._meta['com.runeditrun/classes']].sort(),declaration.classes,`${tool.name}: current native class declarations`);
   assert.deepEqual([...tool._meta['com.runeditrun/clauses']].sort(),declaration.clauses,`${tool.name}: current Core clause metadata`);
   assert.equal(tool.inputSchema.type,'object');
  }
  assert.ok(!JSON.stringify(response.result).includes(monitorId),'discovery exposes declarations, never product records');
 }
 const snapshot=async()=>{
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf*' ORDER BY name").all()).results;
  const result={};
  for(const {name} of tables){
   if(['public_rate_limits','oa_limits'].includes(name))continue;
   result[name]=(await db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all()).results.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return result;
 };
 const before=await snapshot();
 assert.ok(before.monitors.some(row=>row.id===monitorId),'refusal proof protects populated durable storage');
 // Every listed tool is tested at the unauthenticated boundary. Main's native
 // adapters are callable only after current signed authority and company policy.
 for(const [index,tool] of expected.entries()){
  const response=await fetch(origin+'/mcp',{method:'POST',headers:{origin,accept:'application/json, text/event-stream','content-type':'application/json','mcp-protocol-version':'2025-11-25'},body:JSON.stringify({jsonrpc:'2.0',id:index+1,method:'tools/call',params:{name:tool.name,arguments:{id:monitorId,enabled:true,confirm:true}}})});
  assert.equal(response.status,401,`${tool.name}: absent signed authority refuses invocation`);
  const body=await response.text();
  assert.ok(!body.includes(monitorId)&&!body.includes('structuredContent'),'refusal exposes no product record');
 }
 assert.deepEqual(await snapshot(),before,'every unauthorized invocation preserves every durable product, credential, audit and custody row');
 console.log('AGENT-SURFACE-DISCOVERY passed: both native protocol eras, exact current contract registry/classes/clauses, all 34 unauthorized invocations preserve complete durable state.');
}

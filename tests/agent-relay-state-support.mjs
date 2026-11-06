import assert from 'node:assert/strict';

// Relay membership is a projection of Business MCP audit and approval state.
// Check its complete delta rather than exempting a new bookkeeping table.
export function expectedRelayState(before,after,business) {
 const ordered=rows=>rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const prior=new Map(before.agent_door_relay.map(row=>[row.decision_id,row]));
 const touched=new Set();
 for(const record of after.agent_door_audit) {
  const old=before.agent_door_audit.find(row=>row.id===record.id);
  if(old&&JSON.stringify(old)===JSON.stringify(record))continue;
  const audit=JSON.parse(record.row);
  if(prior.has(record.id)||(audit.door==='mcp'&&audit.consent!=null))touched.add(record.id);
 }
 for(const table of ['agent_door_approvals','agent_door_reviews'])for(const record of after[table]) {
  const old=before[table].find(row=>row.id===record.id);
  if(old&&old.state!==record.state) {
   const id=JSON.parse(record.saved).decision_id;
   if(prior.has(id))touched.add(id);
  }
 }
 const actual=new Map(after.agent_door_relay.map(row=>[row.decision_id,row]));
 assert.equal(actual.size,after.agent_door_relay.length,'one relay row per decision');
 assert.deepEqual([...actual.keys()].sort(),[...new Set([...prior.keys(),...touched])].sort(),'exact audit/approval relay membership');
 const head=Math.max(0,...before.agent_door_relay.map(row=>row.sequence));
 const expected=[...prior.values()].filter(row=>!touched.has(row.decision_id));
 for(const id of touched) {
  const row=actual.get(id);
  assert.equal(row.business,prior.get(id)?.business??business);
  assert.ok(Number.isSafeInteger(row.sequence)&&row.sequence>head,'changed decision advances the relay');
  expected.push({sequence:row.sequence,decision_id:id,business:prior.get(id)?.business??business});
 }
 assert.equal(new Set(after.agent_door_relay.map(row=>row.sequence)).size,after.agent_door_relay.length);
 assert.deepEqual(ordered([...after.agent_door_relay]),ordered(expected),'unrelated relay rows remain exact');
 if(after.sqlite_sequence) {
  const sequence=after.sqlite_sequence.find(row=>row.name==='agent_door_relay');
  const current=Math.max(0,...after.agent_door_relay.map(row=>row.sequence));
  if(sequence)assert.equal(sequence.seq,current,'relay sequence ledger matches its retained high-water mark');
 }
 return ordered(expected);
}

export function includeRelayExpectation(expected,before,after,business) {
 expected.agent_door_relay=expectedRelayState(before,after,business);
 if(expected.sqlite_sequence) {
  const current=after.sqlite_sequence.find(row=>row.name==='agent_door_relay');
  expected.sqlite_sequence=expected.sqlite_sequence.filter(row=>row.name!=='agent_door_relay');
  if(current)expected.sqlite_sequence.push({...current});
  expected.sqlite_sequence.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 }
}

export function relaySnapshotGuard(business) {
 let previous;
 return current=>{
  if(previous)expectedRelayState(previous,current,business);
  previous=structuredClone(current);
 };
}

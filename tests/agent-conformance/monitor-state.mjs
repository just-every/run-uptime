import assert from 'node:assert/strict';

// A separate paused native record keeps this standard fixture independent of
// the running update, pause and resume operations in every policy phase.
export async function pausedUpdateFixture(http,definition) {
 const record=await http.json('/api/monitors',definition);
 assert.equal(record.definition.enabled,false,'the standard edit fixture is natively paused');
 return {pausedUpdate:record};
}

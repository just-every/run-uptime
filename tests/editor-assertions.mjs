import assert from 'node:assert/strict';
import {additionalAssertions,assembleAssertions} from '../public/editor-definition.mjs';
import {validateDefinition} from '../src/domain/policy.mjs';

const existing={status:201,bodyIncludes:'ready',header:{name:'x-status',equals:'ready'},json:{path:'status',equals:'ready'},latencyMs:250};
const snapshot=structuredClone(existing),extra=additionalAssertions(existing);
assert.deepEqual(extra,{json:existing.json,latencyMs:250});
const edited=assembleAssertions({status:'201',body:'ready',headerName:'x-status',headerValue:'ready',additional:JSON.stringify(extra)});
assert.deepEqual(edited,existing,'roundtrip preserves every success criterion');assert.deepEqual(existing,snapshot,'preparing the form does not mutate saved criteria');
const definition=validateDefinition({name:'Explicit API criteria',url:'http://127.0.0.1:15481/api/status',assertions:edited},[15481]);assert.deepEqual(definition.assertions,existing,'real domain validation preserves the assembled input');
for(const key of ['status','bodyIncludes','header'])assert.throws(()=>assembleAssertions({status:'201',additional:JSON.stringify({[key]:key==='status'?200:key==='header'?{name:'x-status',equals:'wrong'}:'wrong'})}),/fields above/,'ambiguous duplicate criterion must be rejected');
assert.throws(()=>assembleAssertions({status:'200',additional:'null'}),/JSON object/);assert.throws(()=>assembleAssertions({status:'200',additional:'[]'}),/JSON object/);assert.throws(()=>assembleAssertions({status:'200',additional:'{"unknown":true}'}),/json and latencyMs/);
assert.deepEqual(assembleAssertions({status:'200'}),{status:200},'optional blank fields do not fabricate checks');
assert.deepEqual(assembleAssertions({status:'201',body:'new required body'}),{status:201,bodyIncludes:'new required body'},'explicit user edits remain actual criteria');
console.log('EDITOR-ASSERTIONS-001 passed: complete criterion roundtrip/native validation, ambiguous overrides rejected, immutable form preparation and explicit optional edits.');

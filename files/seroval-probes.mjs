// Author: Run Edit Run fleet, 2026-11-15. Safe, bounded dependency probes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
const root=process.argv[2];
assert.ok(root,'checkout root required');
const require=createRequire(pathToFileURL(resolve(root,'package.json')));
const graph=JSON.parse(readFileSync(resolve(process.env.HOME,'rer-consolidation/work/gr-mt-uptime-dep-6/packet/seroval-graph.json'),'utf8'));
const versions=new Set();
function walk(value){if(!value || typeof value!=='object')return;for(const [key,item] of Object.entries(value)){if(key==='seroval' && item?.version)versions.add(item.version);walk(item)}}
walk(graph);
assert.ok(versions.size>0,'reachable seroval must be found');
for(const version of versions){const [major,minor,patch]=version.split('.').map(Number);assert.ok(major>1 || major===1 && (minor>6 || minor===6 && patch>=11),'all reachable copies cover all five reported advisory version ranges')}
console.log('PASS reachable dependency versions: '+[...versions].join(', '));
const reactRouterRequire=createRequire(require.resolve('@tanstack/react-router'));
const routerRequire=createRequire(reactRouterRequire.resolve('@tanstack/router-core'));
const entry=routerRequire.resolve('seroval');
const seroval=await import(pathToFileURL(entry));
const {serialize,deserialize,toJSON,fromJSON,fromCrossJSON,toCrossJSON}=seroval;
// f86p: overriding a typed array constructor must not select executable code.
const bytes=new Uint8Array([1,2,255]);
let constructorReads=0;
Object.defineProperty(bytes,'constructor',{get(){constructorReads++;return {name:'fleet_injected()'}}});
const code=serialize(bytes);
assert.ok(!code.includes('fleet_injected'));
assert.ok(deserialize(code) instanceof Uint8Array);
assert.deepEqual([...deserialize(code)],[1,2,255]);
console.log('PASS typed-array attacker-chosen typed-array constructor cannot control emitted code; Uint8Array round trip preserved');
// 9wx9: script-sensitive regular expression text stays escaped in emitted JS.
for(const pattern of ['<!--','</script>','a<b']){
 const expression=new RegExp(pattern,'gi');const emitted=serialize(expression);
 assert.ok(!emitted.includes('<'),'HTML-sensitive RegExp source must not enter script raw');
 const restored=deserialize(emitted);assert.equal(restored.source,expression.source);assert.equal(restored.flags,expression.flags);
}
console.log('PASS HTML-sensitive RegExp serialization and round trip');
// wp97 / 97r2: JSON array-like objects cannot prescribe allocation or loop sizes.
for(const length of [4294967295,0.5,-1]){
 const payload=toJSON([1]);payload.t.a={length};
 assert.throws(()=>fromJSON(payload));
 const cross=toCrossJSON([1]);cross.a={length};
 assert.throws(()=>fromCrossJSON(cross));
}
console.log('PASS malformed array-like list nodes rejected by fromJSON/fromCrossJSON');
// 7rv5: public marker-shaped objects cannot impersonate private stream classes.
for(const marker of ['__SEROVAL_SEQUENCE__','__SEROVAL_STREAM__']){
 const value={[marker]:true,source:{on:'not-callable'},length:3,doneAt:-1};
 assert.deepEqual(fromJSON(toJSON(value)),value);
}
console.log('PASS forged stream/sequence marker objects remain ordinary data');
const value={date:new Date('2026-01-02T03:04:05Z'),map:new Map([['a',new Set([1,2])]]),bytes:new Uint8Array([3,4]),regexp:/abc/gi,array:[undefined,null,true,42,'safe']};
value.self=value;
assert.deepEqual(fromJSON(toJSON(value)),value);
console.log('PASS legitimate cyclic structured-data round trip');
console.log('All 6 focused probe groups passed. These probes cover representative repaired boundaries; no application remote exploit is claimed.');

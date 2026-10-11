import {test} from 'node:test';
import assert from 'node:assert/strict';
import {controlOrigin} from '../runners/src/control-origin.mjs';
test('configured hosted HTTPS and explicitly enabled local control origins',()=>{
 assert.equal(controlOrigin('https://monitor.example.com').origin,'https://monitor.example.com');
 for(const port of [15482,15520,49152])assert.equal(controlOrigin(`http://127.0.0.1:${port}`,{localReview:true}).port,String(port));
 for(const value of ['http://monitor.example.com','http://127.0.0.1:80','http://127.0.0.1:15520','https://user:pass@example.com','https://example.com/','https://example.com/a','https://example.com?x=y','https://example.com#x','https://example.com\\@127.0.0.1','file:///a'])assert.throws(()=>controlOrigin(value),value);
 for(const value of ['http://monitor.example.com','http://localhost:49152','http://127.0.0.1:49152/a','http://127.0.0.1:49152/'])assert.throws(()=>controlOrigin(value,{localReview:true}),value);
 assert.throws(()=>controlOrigin('http://127.0.0.1:49152',{localReview:'true'}));
});

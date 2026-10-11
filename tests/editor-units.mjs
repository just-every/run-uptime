import {test} from 'node:test';
import assert from 'node:assert/strict';
import {minutesToMilliseconds,secondsToMilliseconds} from '../public/editor-units.mjs';
import {validateDefinition} from '../src/domain/policy.mjs';
test('friendly time units preserve milliseconds exactly across policy bounds',()=>{
 for(const ms of [5000,5001,10000,60000,86400000])assert.equal(minutesToMilliseconds(String(ms/60000)),ms);
 for(const ms of [50,51,1000,2000,9999,10000])assert.equal(secondsToMilliseconds(String(ms/1000)),ms);
 const d=validateDefinition({name:'Human units',url:'https://example.org/health',intervalMs:minutesToMilliseconds('1.5'),timeoutMs:secondsToMilliseconds('2.5'),freshnessMs:minutesToMilliseconds('3')},[]);
 assert.equal(d.intervalMs,90000);assert.equal(d.timeoutMs,2500);assert.equal(d.freshnessMs,180000);
});
test('fractional milliseconds, blank and nonfinite units are rejected',()=>{
 for(const value of ['', ' ', 'NaN', 'Infinity', '-1', '0.00000001'])assert.throws(()=>minutesToMilliseconds(value));
 assert.throws(()=>secondsToMilliseconds('0.0001'));
});

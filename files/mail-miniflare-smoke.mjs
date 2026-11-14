import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(resolve('src/base/modules/mail/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const mf=new Miniflare(convertV4MiniflareOptions({name:'synthetic-uptime-1',modules:true,script:'export default {async fetch(request, env) { await env.DB.exec("CREATE TABLE IF NOT EXISTS checks (value TEXT)"); await env.DB.prepare("INSERT INTO checks (value) VALUES (?)").bind("synthetic-uptime-1").run(); const row = await env.DB.prepare("SELECT value FROM checks").first(); return Response.json(row); }}',compatibilityDate:'2026-09-07',d1Databases:['DB'],cf:{}}));
try {
 const response=await mf.dispatchFetch('http://localhost/');
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{value:'synthetic-uptime-1'});
 console.log('PASS nested mail-module Miniflare Worker HTTP dispatch and D1 roundtrip');
} finally {await mf.dispose();}

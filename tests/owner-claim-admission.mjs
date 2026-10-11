import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID,createHash} from 'node:crypto';
import {admissionRuntime} from './admission-runtime.mjs';
import {testAuthBindings,authRequest} from './auth-test-support.mjs';
import {freePort} from '../scripts/local-ports.mjs';
// Ephemeral signing keys live only at the test's RER issuer edge.
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}), issuer='https://rer-issuer.example.test', installationId=randomUUID();
const origin=`http://127.0.0.1:${await freePort()}`;
const bindings={...testAuthBindings,UPTIME_LOCAL_REVIEW:'true',UPTIME_ORIGIN:origin,RER_OWNER_CLAIM_ISSUER:issuer,RER_OWNER_CLAIM_INSTALLATION_ID:installationId,RER_OWNER_CLAIM_APP_ORIGIN:origin,RER_OWNER_CLAIM_PUBLIC_KEYS:JSON.stringify({test:publicKey.export({format:'jwk'})})};
// The real HTTP listener receives the same trusted deployment origin.
const app=await admissionRuntime(bindings);
const call=authRequest(origin);
const token=(changes={})=>{
 const now=Math.floor(Date.now()/1000), encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const input=encode({alg:'ES256',typ:'rer-owner-claim+jwt',kid:'test'})+'.'+encode({v:1,iss:issuer,aud:origin,installationId,email:bindings.OWNER_EMAIL,jti:randomUUID(),iat:now,exp:now+240,...changes});
 return input+'.'+sign('sha256',Buffer.from(input),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
};
async function snapshot(){const rows=await app.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'oa_%' OR name='oc_owner_claims') ORDER BY name").all();const tables=await app.DB.batch(rows.results.map(({name})=>app.DB.prepare(`SELECT * FROM ${name} ORDER BY rowid`)));return createHash('sha256').update(JSON.stringify(tables.map(table=>table.results))).digest('hex')}
try {
 const empty=await snapshot();
 assert.equal((await call('/auth/owner-claim')).status,200);
 assert.equal(await snapshot(),empty,'confirmation GET performs zero durable writes');
 for(const changes of [{aud:'https://other.example.test'},{email:'other@example.test'},{exp:Math.floor(Date.now()/1000)-1}]){assert.equal((await call('/auth/owner-claim',{token:token(changes)})).status,403);assert.equal(await snapshot(),empty,'invalid claim performs zero durable writes')}
 const accepted=await call('/auth/owner-claim',{token:token(),displayName:'Claim owner',returnTo:'/'});
 assert.equal(accepted.status,303,'signed claim admits through native operator-auth');
 const cookie=accepted.headers.get('set-cookie').split(';')[0];
 assert.equal((await call('/api/overview',undefined,{cookie})).status,200);
 assert.equal((await app.DB.prepare('SELECT COUNT(*) n FROM oc_owner_claims').first()).n,1);
 const claimed=await snapshot();
 await app.restart();
 assert.equal((await call('/api/overview',undefined,{cookie})).status,200,'native session survives a real Worker restart');
 assert.equal((await call('/auth/owner-claim',{token:token(),displayName:'Second claimant'})).status,409);
 assert.equal(await snapshot(),claimed,'a second valid claim is permanently refused without writes');
 assert.equal((await call('/auth/bootstrap',{token:bindings.SETUP_TOKEN,displayName:'Other'})).status,409,'legacy bootstrap preserves the same admission ledger');
 console.log('OWNER-CLAIM-ADMISSION passed: native signed admission, confirmation/invalid no-write checks, authenticated API after restart and durable second claim refusal.');
} finally {await app.close()}

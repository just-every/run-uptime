import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {configure} from '../src/base/modules/operator-auth/config.mjs';
import {opaqueToken,hashToken} from '../src/base/modules/operator-auth/crypto.mjs';
import {sessionCookie} from '../src/base/modules/operator-auth/http.mjs';
import {validateDefinition,evaluate} from '../src/domain/policy.mjs';
import {probeHttp} from '../runners/src/engine.mjs';

// Historical SQL input, using the maintained credential encoding and real probe
// evidence. This does not pretend the current Worker can bootstrap an old schema.
export async function populateLegacy(DB,{bindings,origin,fixturePort,grant}){
 const config=configure({origin,local:true,...bindings});
 const operatorId=randomUUID(),sessionId=randomUUID(),token=opaqueToken();
 const createdAt=Date.now()-60000,expiresAt=createdAt+config.sessionSeconds*1000;
 const hash=await hashToken(config.SESSION_SECRET,'session',token);
 const definition=validateDefinition({name:'Legacy café 日本語 observation',url:`http://127.0.0.1:${fixturePort}/health`,intervalMs:5000,retries:0,confirmSlots:1,recoverSlots:1},[fixturePort]);
 const control=await fetch(`http://127.0.0.1:${fixturePort}/control`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'failing'})});
 assert.equal(control.status,200);
 assert.equal(control.headers.get('x-uptime-fixture'),grant.identity,'control reached this fixture');
 const observation={...await probeHttp({...definition,fixtureIdentity:grant.identity},definition.probes[0],[fixturePort]),attempt:0};
 assert.equal(observation.outcome,'target_failure','legacy trigger has real authorised failing evidence');
 assert.equal(observation.status,503);
 const monitorId=randomUUID(),revision=1,due=observation.startedAt,slotId=`${monitorId}:${revision}:${due}`,eventId=randomUUID();
 const serialized=JSON.stringify(definition);
 // The same public policy must preserve the historical assignment-free quorum.
 const state={...evaluate(definition,[observation],{},observation.completedAt),notificationOpen:true};
 assert.equal(state.targetState,'Failing');
 const event={schemaVersion:1,id:eventId,kind:'trigger',visibility:'private',monitorId,monitorName:definition.name,state:'Failing',slotId,observedAt:observation.completedAt};
 // The receipt is retained history, not a new receiver-acceptance claim.
 const receipt={effect:['stored','task','owned','receiver'].join('-'),peoplePaged:false};
 await DB.batch([
  DB.prepare('INSERT INTO oa_operators(id,email,display_name,role,status,version,created_at) VALUES(?,?,?,?,?,?,?)').bind(operatorId,config.OWNER_EMAIL,'Legacy owner','owner','active',1,createdAt),
  DB.prepare('INSERT INTO oa_bootstrap(singleton,claim_id,claimed_at) VALUES(1,?,?)').bind(operatorId,createdAt),
  DB.prepare('INSERT INTO oa_sessions(id,token_hash,operator_id,operator_version,kind,source_token_id,created_at,expires_at,revoked_at) VALUES(?,?,?,?,?,NULL,?,?,NULL)').bind(sessionId,hash,operatorId,1,'native',createdAt,expiresAt),
  DB.prepare('INSERT INTO monitors VALUES(?,?,?,?,?)').bind(monitorId,revision,serialized,due+definition.intervalMs,JSON.stringify(state)),
  DB.prepare('INSERT INTO revisions VALUES(?,?,?,?)').bind(monitorId,revision,serialized,createdAt),
  DB.prepare('INSERT INTO slots VALUES(?,?,?,?,?,?,?,?,?,?)').bind(slotId,monitorId,revision,due,'complete',serialized,randomUUID(),due+30000,0,0),
  DB.prepare('INSERT INTO observations VALUES(?,?,?,?,?)').bind(observation.id,slotId,observation.probe,observation.attempt,JSON.stringify(observation)),
  DB.prepare('INSERT INTO outbox VALUES(?,?,?,?,?,?,?,?)').bind(eventId,monitorId,slotId,'trigger',JSON.stringify(event),'accepted',0,JSON.stringify(receipt)),
 ]);
 return {cookie:sessionCookie(token,config).split(';')[0]};
}

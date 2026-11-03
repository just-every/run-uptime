import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';
import {phaseState} from './state.mjs';
import {nativeHttp} from './http.mjs';

const custody=new Map();
async function read(context,id){
 const http=nativeHttp(context),rows=await http.json('/api/notifications/destinations');
 const record=rows.find(row=>row.id===id);assert.ok(record);assert.equal(record.enabled,true);assert.equal(record.credentialsAvailable,true);
 const db=await context.database('DB');
 const saved=await db.prepare('SELECT * FROM notification_destinations WHERE id=?').bind(id).first();
 const credential=await db.prepare('SELECT * FROM notification_credentials WHERE id=?').bind(saved.credential_id).first();
 assert.equal(saved.kind,'email');assert.equal(saved.enabled,1);assert.ok(credential.ciphertext);assert.equal(credential.destination_id,id);
 return {record,saved,credential};
}
export async function destinationNameFixture(context){
 const http=nativeHttp(context),route=await http.json('/api/alert-route');
 const policy={scope:'installation',mode:'selected',destinationIds:[],expectedRevision:route.revision};
 const preview=await http.json('/api/alert-route/preview',policy);
 await http.json('/api/alert-route/apply',{...policy,digest:preview.digest});
 const destination=await http.json('/api/notifications/destinations',{name:'synthetic-uptime-'+randomUUID(),kind:'email',enabled:true,address:['synthetic-uptime-2','recipient.example.test'].join(String.fromCharCode(64))});
 return {destinationName:{id:destination.id}};
}
export async function beforeDestinationName(context){
 if(context.step.id!=='destination-name')return;
 custody.set(context.origin+context.phase,await read(context,phaseState.get(context.origin).destinationName.id));
}
export async function afterDestinationName(context){
 if(context.step.id!=='destination-name')return;
 const before=custody.get(context.origin+context.phase),after=await read(context,context.args.id);
 assert.deepEqual(after.record,{...before.record,name:context.args.destination.name});
 assert.ok(isDeepStrictEqual(after.saved,{...before.saved,name:context.args.destination.name}),'native name is the only changed destination column');
 assert.ok(isDeepStrictEqual(after.credential,before.credential),'native credential identity and ciphertext remain exact');
 assert.deepEqual(context.result,{updated:true});
}

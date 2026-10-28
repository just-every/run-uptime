import assert from 'node:assert/strict';

// A populated pre-0079 policy/history checkpoint inside notify-upgrade's genuine
// legacy-to-current upgrade. No destination or dispatch authority is introduced.
export async function seedRoutingUpgrade(DB){
 const policy={scope:'installation',value:'',mode:'selected',destinationIds:[],contactSettings:{},fallback:{destinationIds:[],deadlineSeconds:120},teamIds:[],filters:{environments:['production']},quietHours:{timeZone:'America/New_York',start:'22:00',end:'07:00'},revision:7,updatedAt:1790000000000};
 await DB.prepare("INSERT INTO alert_routes(scope_kind,scope_value,mode,destination_ids,revision,updated_at,contact_settings,fallback,team_ids,filters,quiet_hours) VALUES('installation','','selected','[]',7,?,'{}',?,'[]',?,?)").bind(policy.updatedAt,JSON.stringify(policy.fallback),JSON.stringify(policy.filters),JSON.stringify(policy.quietHours)).run();
 await DB.prepare('INSERT INTO alert_route_changes(id,scope_kind,scope_value,previous_policy,current_policy,changed_at,actor_ref) VALUES(?,?,?,?,?,?,NULL)').bind(crypto.randomUUID(),'installation','',JSON.stringify(policy),JSON.stringify(policy),policy.updatedAt).run();
 return {routes:(await DB.prepare('SELECT * FROM alert_routes').all()).results,changes:(await DB.prepare('SELECT * FROM alert_route_changes').all()).results};
}
export async function proveRoutingUpgrade(DB,before){
 const routes=(await DB.prepare('SELECT * FROM alert_routes').all()).results,changes=(await DB.prepare('SELECT * FROM alert_route_changes').all()).results;
 assert.deepEqual(routes.map(({business_hours,...row})=>row),before.routes,'0079 preserves every applied route policy byte');
 assert.deepEqual(changes.map(({drill,...row})=>row),before.changes,'0079 preserves exact prior route history');
 assert.ok(routes.every(row=>row.business_hours===null)&&changes.every(row=>row.drill===null),'old routes remain always selected and prior changes are not drill receipts');
 for(const [table,column] of [['alert_drills','route_context'],['alert_contact_schedules','route_business_rules'],['alert_contact_schedules','business_allowed'],['alert_fallback_chains','route_business_rules']])assert.ok((await DB.prepare(`PRAGMA table_info(${table})`).all()).results.some(row=>row.name===column));
 console.log('ROUTING-001 0079 populated upgrade passed: prior route and history bytes unchanged, business selection remains always, no new send authority.');
}

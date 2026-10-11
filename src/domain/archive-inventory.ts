import {TABLES,columns} from './archive-schema.ts'
/** Every permanent schema table has a portability decision. Unknown tables and
 * foreign integration namespaces refuse export rather than silently lose data. */
export const installationLocalTables:Record<string,string>={
 public_rate_limits:'Installation public-path request counters; expire after their window.',
 _cf_METADATA:'D1 installation metadata; never product records.',
 d1_migrations:'Receiving installation migration ledger; never replace applied migration history.',
 sessions:'Retired installation authentication sessions.',login_attempts:'Authentication rate-limit authority.',
 oa_operators:'Installation operator identities, roles and authorization.',oa_bootstrap:'Installation owner-claim authority.',
 oa_tokens:'Magic-link and invitation authentication authority.',oa_sessions:'Installation session authority.',
 oa_dev_credentials:'Installation record of credentials minted in a local dev session; never portable.',oa_external_identities:'Installation external authentication identities.',oa_limits:'Authentication rate limits.',oa_invitation_cancellations:'Invitation authorization and revocation ledger.',
 oa_domain_rules:'Installation sign-in provider policy; never portable authorization.',
 oa_step_up_challenges:'Installation session-bound step-up token authority; never portable.',
 runner_contact:'Installation runner contact, not product target evidence.',
 attempt_checkpoints:'Rebuildable installation-local scheduled evidence checkpoints.',
 runners:'Installation runner identities and encrypted per-runner keys.',runner_assignments:'Installation execution assignments; revisions retain their selected configuration.',evidence_generation:'Installation atomic evidence projection generations.',monitoring_watch:'Installation watch dispatch state; never portable authority.',
 heartbeat_authority:'Installation heartbeat token and receipt authority.',heartbeat_claims:'Installation heartbeat execution snapshots.',heartbeat_limits:'Installation ingress rate limits.',
 notification_credentials:'Installation destination ciphertext, webhook/Slack URLs and signing keys; email definition is separately exported.',
 notification_claim_custody:'Installation dispatch reservation hashes and claim authorization; product attempts and outcomes are retained separately.',
 integration_tokens:'Installation integration token authority.',integration_token_usage:'Installation token authorization audit.',integration_token_events:'Installation token administration audit.',
 rer_mail_development_outbox:'Installation development captures, including sign-in/setup authority; retained until explicit erasure or reset.',
 oc_owner_claims:'Installation signed owner admission ledger; retain permanently, never export credentials or authority.',
 uptime_first_run:'Installation first-run completion; a receiving owner completes setup independently.',
};
export async function assertArchiveInventory(db:D1Database){
 const rows=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all<{name:string}>();
 for(const {name} of rows.results)if(!name.startsWith('rer_portability_')&&!TABLES.includes(name)&&!Object.hasOwn(installationLocalTables,name))throw Error(`Archive unclassified table: ${name}`);
 const sourceColumns:Record<string,string[]>={...columns,notification_destinations:['id','name','kind','enabled','credential_id','created_at','deleted_at'],notification_jobs:[...columns.notification_jobs,'credential_id','claim','claim_until'],integration_deliveries:[...columns.integration_deliveries,'fingerprint','destination_hash','claim','claim_until'],integration_replays:[...columns.integration_replays,'fingerprint']};
 const schemas=await db.batch(TABLES.map(name=>db.prepare(`PRAGMA table_info(${name})`)));
 for(let i=0;i<TABLES.length;i++){const name=TABLES[i],actual=schemas[i].results.map((r:any)=>r.name).sort().join(',');if(actual!==sourceColumns[name].slice().sort().join(','))throw Error(`Archive unsupported table columns: ${name}`)}
 for(const name of TABLES.filter(n=>n.startsWith('integration_'))){const row=await db.prepare(`SELECT COUNT(*) n FROM ${name} WHERE namespace <> 'uptime-notifications'`).first<{n:number}>();if(row?.n)throw Error(`Archive unsupported product namespace: ${name}`)}
}

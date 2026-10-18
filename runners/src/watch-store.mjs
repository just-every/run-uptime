import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync,lstatSync,chmodSync,openSync,closeSync} from 'node:fs';
import {dirname} from 'node:path';
/** Private local evidence and progress survive runner and Worker restarts. The
 * journal contains no webhook address, credential, mail content or target data. */
export function watchStore(path){
 mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const directory=lstatSync(dirname(path));if(!directory.isDirectory()||directory.isSymbolicLink()||directory.uid!==process.getuid())throw Error('Watch journal directory is not owned by this runner');chmodSync(dirname(path),0o700);
 const file=openSync(path,'a',0o600);closeSync(file);const info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid())throw Error('Watch journal is not owned by this runner');chmodSync(path,0o600);
 const db=new DatabaseSync(path);
 db.exec(`PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS progress(id INTEGER PRIMARY KEY CHECK(id=1),incident_id TEXT,failed_since INTEGER,last_notice INTEGER,announced INTEGER NOT NULL);
 INSERT OR IGNORE INTO progress VALUES(1,NULL,NULL,NULL,0);
 CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,incident_id TEXT NOT NULL,kind TEXT NOT NULL,started_at INTEGER NOT NULL,lease_until INTEGER NOT NULL,submitted_at INTEGER,finished_at INTEGER,outcome TEXT NOT NULL,applied INTEGER NOT NULL DEFAULT 0);
 CREATE UNIQUE INDEX IF NOT EXISTS active_attempt ON attempts(incident_id) WHERE finished_at IS NULL;`);
 function transaction(run){db.exec('BEGIN IMMEDIATE');try{const result=run();db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}}
 const progress=()=>db.prepare('SELECT * FROM progress WHERE id=1').get();
 function settle(now){
  db.prepare("UPDATE attempts SET finished_at=?,outcome=CASE WHEN submitted_at IS NULL THEN 'expired' ELSE 'uncertain' END WHERE finished_at IS NULL AND lease_until<=?").run(now,now);
  for(const row of db.prepare('SELECT * FROM attempts WHERE finished_at IS NOT NULL AND applied=0 ORDER BY rowid').all()){
   if(['accepted','uncertain'].includes(row.outcome)){
    if(row.kind==='unreachable')db.prepare('UPDATE progress SET last_notice=?,announced=1 WHERE incident_id=?').run(row.started_at,row.incident_id);
    else db.prepare('UPDATE progress SET incident_id=NULL,failed_since=NULL,last_notice=NULL,announced=0 WHERE incident_id=?').run(row.incident_id);
   }
   db.prepare('UPDATE attempts SET applied=1 WHERE id=?').run(row.id);
  }
 }
 return {
  claim(kind,now,{afterMs,repeatMs,retryMs,leaseMs}){return transaction(()=>{
   settle(now);let row=progress();
   if(kind==='unreachable'){
    if(row.failed_since===null){db.prepare('UPDATE progress SET incident_id=?,failed_since=? WHERE id=1').run(randomUUID(),now);row=progress()}
    if(now-row.failed_since<afterMs||row.last_notice!==null&&now-row.last_notice<repeatMs)return null;
   }else if(!row.announced){
    // Do not erase an interrupted unreachable attempt before reconciling it.
    if(!db.prepare('SELECT 1 FROM attempts WHERE incident_id=? AND finished_at IS NULL').get(row.incident_id))db.prepare('UPDATE progress SET incident_id=NULL,failed_since=NULL,last_notice=NULL,announced=0 WHERE id=1').run();
    return null;
   }
   if(db.prepare('SELECT 1 FROM attempts WHERE incident_id=? AND finished_at IS NULL').get(row.incident_id))return null;
   const previous=db.prepare('SELECT * FROM attempts WHERE incident_id=? AND kind=? ORDER BY rowid DESC LIMIT 1').get(row.incident_id,kind);
   if(previous&&previous.outcome!=='expired'&&now-previous.started_at<retryMs)return null;
   const id=randomUUID();db.prepare("INSERT INTO attempts(id,incident_id,kind,started_at,lease_until,outcome) VALUES(?,?,?,?,?,'claimed')").run(id,row.incident_id,kind,now,now+leaseMs);
   return {id,since:row.failed_since};
  })},
  submitted(id,now){return transaction(()=>{settle(now);return db.prepare("UPDATE attempts SET submitted_at=?,outcome='sending' WHERE id=? AND finished_at IS NULL AND submitted_at IS NULL AND lease_until>?").run(now,id,now).changes===1})},
  finish(id,outcome,now){transaction(()=>{settle(now);db.prepare('UPDATE attempts SET outcome=?,finished_at=? WHERE id=? AND finished_at IS NULL AND lease_until>?').run(outcome,now,id,now);settle(now)})},
  close(){db.close()},
 };
}

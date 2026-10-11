// Test-only D1-shaped port over native SQLite: every batch is a real transaction.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function notificationTestDB({beforeMigration}={}){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()){beforeMigration?.(name,sqlite);sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'))}
 function prepare(sql,values=[]){return {bind(...args){return prepare(sql,args)},async first(){return sqlite.prepare(sql).get(...values)??null},async all(){return {success:true,results:sqlite.prepare(sql).all(...values)}},async run(){const result=sqlite.prepare(sql).run(...values);return {success:true,results:[],meta:{changes:Number(result.changes)}}},sql,values}}
 return {prepare,async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>{const statement=sqlite.prepare(s.sql);if(statement.columns().length)return {success:true,results:statement.all(...s.values),meta:{changes:Number(sqlite.prepare('SELECT changes() n').get().n)}};const r=statement.run(...s.values);return {success:true,results:[],meta:{changes:Number(r.changes)}}});sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}},close(){sqlite.close()}};
}

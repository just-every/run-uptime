import {createOperatorAuth,createAuthHandler} from '@runeditrun/rer/modules/operator-auth';

// Provider-edge D1 adapter: the real Base auth service owns all admission,
// session and one-time-grant writes in the controller's migrated SQLite store.
function d1(sqlite) {
 const prepare=(sql,params=[])=>({
  bind(...values){return prepare(sql,values)},
  async first(column){const row=sqlite.prepare(sql).get(...params);return column?row?.[column]??null:row??null},
  async all(){
   const results=sqlite.prepare(sql).all(...params);
   return {success:true,results,meta:{changes:Number(sqlite.prepare('SELECT changes() AS n').get().n)}};
  },
  async run(){
   const result=sqlite.prepare(sql).run(...params);
   return {success:true,results:[],meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};
  },
 });
 return {prepare,async batch(statements){
  sqlite.exec('BEGIN');
  try{const results=[];for(const statement of statements)results.push(await statement.all());sqlite.exec('COMMIT');return results}
  catch(error){sqlite.exec('ROLLBACK');throw error}
 }};
}
export function nativeAuth(state,url,init) {
 const values=Object.fromEntries(state.secrets.map(item=>[item.name,item.value]));
 const auth=createOperatorAuth({db:d1(state.databases[0].db),clientIp:()=> '192.0.2.1',config:{
  origin:url.origin,OWNER_EMAIL:values.OWNER_EMAIL,SESSION_SECRET:values.SESSION_SECRET,SETUP_TOKEN:values.SETUP_TOKEN,
 }});
 const method=init.method??'GET';
 return createAuthHandler(auth)(new Request(url,{method,
  headers:{...init.headers,origin:url.origin,'content-type':'application/json'},
  ...(method==='GET'?{}:{body:init.body}),
 }));
}

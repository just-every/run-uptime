import {mkdir} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {startSynthetic} from './synthetic-server.mjs';
import {runRunner} from './private-runner.mjs';
if(process.env.RER_DEMO!=='1')throw Error('The packaged demo runner requires RER_DEMO=1');
if(!process.env.SESSION_SECRET||!process.env.UPTIME_ORIGIN)throw Error('Demo container authority missing');
const state='/data/uptime-demo';
for(const folder of [state,state+'/flows',state+'/credentials'])await mkdir(folder,{recursive:true,mode:0o700});
Object.assign(process.env,{UPTIME_GRANT_FILE:state+'/synthetic-grant.json',UPTIME_FLOW_DIR:state+'/flows',UPTIME_CREDENTIAL_DIR:state+'/credentials'});
const controller=new AbortController();
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>controller.abort());
const target=await startSynthetic();
try{
 await runRunner({origin:process.env.UPTIME_ORIGIN,key:createHmac('sha256',process.env.SESSION_SECRET).update('uptime-demo-runner-v1').digest('hex'),
  grantPath:process.env.UPTIME_GRANT_FILE,signal:controller.signal,controlAddress:`http://127.0.0.1:${process.env.PORT??8080}`});
}finally{await target.close();}

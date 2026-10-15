import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';

// Only the Base lifecycle's fresh state grants demo mode. Ambient demo switches
// cannot seed or run against the owner's ordinary installation.
export function runtimeEnvironment(){
 const {RER_DEMO,RER_DEMO_EXPIRES,RER_STATE_DIR,...env}=process.env;
 return env;
}
export async function demoEnvironment(demo){
 if(!demo)return {};
 const state=demo.state;
 for(const folder of ['flows','credentials'])await mkdir(join(state,folder),{recursive:true,mode:0o700});
 return {RER_DEMO:'1',RER_DEMO_EXPIRES:demo.ends,RER_STATE_DIR:state,UPTIME_FLOW_DIR:join(state,'flows'),UPTIME_CREDENTIAL_DIR:join(state,'credentials')};
}

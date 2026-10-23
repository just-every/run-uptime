import {createHmac} from 'node:crypto';
import {readLocalSettings,savedOrigin} from './local-settings.mjs';

// Base's existing local-only door issues the native session. Possession of local
// installation settings cannot create an edition factor proof.
export async function localMfaSession(origin,fetcher=fetch){
 const settings=await readLocalSettings();
 if(origin!==savedOrigin(settings))throw Error('Use this checkout’s saved loopback origin');
 const signature=createHmac('sha256',settings.SESSION_SECRET).update('local-cli\0sign-in').digest('hex');
 const response=await fetcher(origin+'/auth/local/cli-session',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{origin,'content-type':'application/json','x-rer-local-cli':signature},body:JSON.stringify({returnTo:'/app'})});
 if(response.status!==303)throw Error('Start this checkout with rer dev before requesting its local native session');
 const cookie=response.headers.get('set-cookie')?.split(';')[0];
 if(!cookie||!/^operator_session_local(?:_\d+)?=[A-Za-z0-9_-]+$/.test(cookie))throw Error('Base did not issue the expected local session');
 return {cookie,secondFactorRequired:true};
}

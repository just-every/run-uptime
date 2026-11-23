// The console's private JSON API as the editor uses it. A refused session tells the page to sign in again; any other
// failure throws the server's own message, with its HTTP status on the error.
// Sensitive actions can opt into the in-place prompt and retry the retained request once.
const stepUpModule=()=>import(/* @vite-ignore */ new URL('/assets/step-up.js',location.origin).href);

export async function verifyFreshSecondFactor(){
 const {recoverStepUp}=await stepUpModule();
 await recoverStepUp({}, {onlyIfStale:true});
}

export async function api(path,method='GET',data,options={}){
 const response=await fetch(path,{method,headers:{'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:options.signal});
 const value=await response.json().catch(()=>({}));
 const stepUp=['fresh_second_factor_required','second_factor_required'].includes(value.code);
 if(response.status===403&&stepUp&&options.stepUp&&!options.retried){
  const {recoverStepUp}=await stepUpModule();
  await recoverStepUp(value);return api(path,method,data,{...options,retried:true});
 }
 if([401,403].includes(response.status)&&!stepUp)window.dispatchEvent(new Event('uptime:auth-lost'));
 if(!response.ok)throw Object.assign(Error(value.error||`The console answered ${response.status}.`),{status:response.status,code:value.code,stepUp:value.stepUp});
 return value;
}

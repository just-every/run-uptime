// The console's private JSON API as the editor uses it. A refused session tells the page to sign in again; any other
// failure throws the server's own message, with its HTTP status on the error.
// Erasure opts into the console's in-place prompt and retries the retained request once.
export async function api(path,method='GET',data,options={}){
 const response=await fetch(path,{method,headers:{'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:options.signal});
 const value=await response.json().catch(()=>({}));
 const stepUp=['fresh_second_factor_required','second_factor_required'].includes(value.code);
 if(response.status===403&&stepUp&&options.stepUp&&!options.retried){
  const pathToPrompt='/assets/step-up.js';
  const {recoverStepUp}=await import(/* @vite-ignore */ new URL(pathToPrompt,location.origin).href);
  await recoverStepUp(value);return api(path,method,data,{...options,retried:true});
 }
 if([401,403].includes(response.status)&&!stepUp)window.dispatchEvent(new Event('uptime:auth-lost'));
 if(!response.ok)throw Object.assign(Error(value.error||`The console answered ${response.status}.`),{status:response.status,code:value.code,stepUp:value.stepUp});
 return value;
}

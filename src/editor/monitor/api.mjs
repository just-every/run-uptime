// The console's private JSON API as the editor uses it. A refused session tells the page to sign in again; any other
// failure throws the server's own message, with its HTTP status on the error.
export async function api(path,method='GET',data,options={}){
 const response=await fetch(path,{method,headers:{'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:options.signal});
 const value=await response.json().catch(()=>({}));
 if([401,403].includes(response.status))window.dispatchEvent(new Event('uptime:auth-lost'));
 if(!response.ok)throw Object.assign(Error(value.error||`The console answered ${response.status}.`),{status:response.status});
 return value;
}

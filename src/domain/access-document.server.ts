import {documentHeaders,escapeHtml,productName,shellDocument} from './document-shell.server.ts'

// An authenticated operator without owner authority stays signed in and sees no installation data.
// A member narrowed to some monitors is told so, rather than that only an owner may enter.
export function accessDeniedDocument(displayName:string,head=false,narrowed=false){
 const body=head?null:shellDocument({title:`Access denied · ${productName}`,style:'strong{overflow-wrap:anywhere}',card:`<h1>Access denied</h1>${narrowed?`<p>You are signed in as <strong>${escapeHtml(displayName)}</strong>. Your access is limited to particular monitors, and the ${productName} console lists whole workspaces only.</p><p>Ask an owner for workspace-wide access to open the console, or use the monitor and incident links you were sent.</p><p><a class="text-link" href="/login">Sign in with another account</a></p>`:`<p>You are signed in as <strong>${escapeHtml(displayName)}</strong>. Only an owner can access the ${productName} console and setup.</p><p>Use an owner account to manage this installation.</p><p><a class="text-link" href="/login">Sign in with an owner account</a></p>`}<p><a class="text-link" href="/">Go to the home page</a></p>`});
 return new Response(body,{status:403,headers:{...documentHeaders,'cache-control':'no-store, private',vary:'Cookie','x-content-type-options':'nosniff'}});
}

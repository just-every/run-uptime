import {documentHeaders,escapeHtml,productName,shellDocument} from './document-shell.server.ts'

// An authenticated operator without owner authority stays signed in and sees no installation data.
export function accessDeniedDocument(displayName:string,head=false){
 const body=head?null:shellDocument({title:`Access denied · ${productName}`,style:'strong{overflow-wrap:anywhere}',card:`<h1>Access denied</h1><p>You are signed in as <strong>${escapeHtml(displayName)}</strong>. Only an owner can access the ${productName} console and setup.</p><p>Use an owner account to manage this installation.</p><p><a class="text-link" href="/login">Sign in with an owner account</a></p><p><a class="text-link" href="/">Go to the home page</a></p>`});
 return new Response(body,{status:403,headers:{...documentHeaders,'cache-control':'no-store, private',vary:'Cookie','x-content-type-options':'nosniff'}});
}

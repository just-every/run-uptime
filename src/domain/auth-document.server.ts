import branding from '../branding.json' with {type:'json'}
import {normalizeEmail} from '@runeditrun/rer/modules/operator-auth'
import {documentHeaders,escapeHtml,productName,shellDocument} from './document-shell.server.ts'

// Field labels, the field and the navy pill. The button keeps the literal brand accent from branding.json.
const style=`label{display:block;margin:0 0 18px;color:var(--ink);font-size:15px;font-weight:700;line-height:1.4}
input:not([type=hidden]){display:block;width:100%;min-height:52px;margin-top:8px;padding:12px 16px;border:1px solid var(--field-line);border-radius:12px;background:#fff;color:var(--ink);font:500 17px/1.4 var(--sans)}
input:not([type=hidden]):focus-visible{border-color:var(--ink);outline-offset:2px}
button{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;margin:6px 0 0;padding:0 24px;border:0;border-radius:999px;background:${branding.primaryColor};color:#fff;font:600 17px/1 var(--sans);cursor:pointer;box-shadow:0 1px 1px rgba(20,32,74,.12),0 10px 24px -12px rgba(20,32,74,.55)}
button:hover{background:var(--ink-hover)}
button:focus-visible{outline-offset:4px}
.auth-help{margin:16px 0 0}
code{color:var(--ink);font:500 .9em/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow-wrap:anywhere}`;

// A hosted Worker names its deploy environment (UPTIME_DEPLOY_ENVIRONMENT, validated at startup); each named environment keeps its own settings file.
const hostedSettings=(environment?:string)=>`.rer/deploy/${environment??'production'}.secrets.env`;

export function authDocument(setup=false,sent=false,localReview=false,invalidSetupToken=false,environment?:string,claimOpen=true,mailUnavailable=false,loginHint=''){
 const hosted=hostedSettings(environment);
 let email='';
 if(!setup&&loginHint){try{email=normalizeEmail(loginHint)}catch{/* Invalid hints leave the editable field empty. */}}
 const title=invalidSetupToken?'Setup token not accepted':sent?'Check your email':setup?`Set up ${productName}`:`Sign in to ${productName}`;
 const lead=sent?'If this email belongs to an active operator, a sign-in link has been requested. Open the link and confirm to continue.':setup?'Use the one-time setup token supplied during installation: SETUP_TOKEN in data/local-secrets.json for a local install, or in '+hosted+' in the checkout that deployed a hosted installation.':'Enter your operator email to receive a secure sign-in link.';
 const fields=setup?`<label>Setup token<input name="token" type="password" autocomplete="off" required${invalidSetupToken?' aria-invalid="true" aria-describedby="setup-token-error"':''}></label><label>Your name<input name="displayName" autocomplete="name" required></label>`:`<label>Email address<input name="email" type="email" autocomplete="email" required maxlength="254"${email?` value="${escapeHtml(email)}"`:''}></label>`;
 // Sign-in returns through /setup, which sends a finished owner on to the console at /app.
 const form=`<form method="post" action="${setup?'/auth/bootstrap':'/auth/magic-link'}">${fields}<input type="hidden" name="returnTo" value="/setup"><button>${setup?'Create owner account':'Send sign-in link'}</button></form>${!setup&&claimOpen?'<p class="auth-help"><a class="text-link" href="/claim">Claim the first owner with an installation token</a></p>':''}`;
 return new Response(shellDocument({title,style,card:`<h1>${title}</h1><p${sent?' role="status"':''}>${lead.replace('SETUP_TOKEN','<code>SETUP_TOKEN</code>').replace('data/local-secrets.json','<code>data/local-secrets.json</code>').replace(hosted,`<code>${hosted}</code>`)}</p>${invalidSetupToken?'<p id="setup-token-error" role="alert">The setup token was not accepted. Check the installation token and enter it again.</p>':''}${mailUnavailable?'<p role="alert">Sign-in email is not available right now. Ask the person who runs this app to check its mail settings, then try again.</p>':''}${form}`}),{headers:documentHeaders});
}

// Presentation only, after Base has refused this exact native form submission.
// Use Base's form media-type distinction; JSON callers retain the original response.
export async function nativeClaimFailure(request:Request,response:Response,environment?:string){
 if(request.method!=='POST'||new URL(request.url).pathname!=='/auth/bootstrap'||
  (request.headers.get('content-type')??'').split(';')[0].trim().toLowerCase()!=='application/x-www-form-urlencoded'||
  response.status!==403||!response.headers.get('content-type')?.startsWith('application/json'))return response;
 const failure=await response.clone().json() as {error?:string};
 if(failure.error!=='invalid_setup_token')return response;
 const document=authDocument(true,false,false,true,environment),headers=new Headers(response.headers);
 // Keep Base's denial headers and status, with the existing auth document's
 // resource policy and origin-only referrer so a corrected native form can submit.
 for(const name of ['content-type','content-security-policy','referrer-policy'])headers.set(name,document.headers.get(name)!);
 return new Response(document.body,{status:response.status,statusText:response.statusText,headers});
}

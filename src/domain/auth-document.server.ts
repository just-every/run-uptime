import branding from '../branding.json' with {type:'json'}
import {documentHeaders,productName,shellDocument} from './document-shell.server.ts'

// Field labels, the field and the navy pill. The button keeps the literal brand accent from branding.json.
const style=`label{display:block;margin:0 0 18px;color:var(--ink);font-size:15px;font-weight:700;line-height:1.4}
input:not([type=hidden]){display:block;width:100%;min-height:52px;margin-top:8px;padding:12px 16px;border:1px solid var(--field-line);border-radius:12px;background:#fff;color:var(--ink);font:500 17px/1.4 var(--sans)}
input:not([type=hidden]):focus-visible{border-color:var(--ink);outline-offset:2px}
button{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;margin:6px 0 0;padding:0 24px;border:0;border-radius:999px;background:${branding.primaryColor};color:#fff;font:600 17px/1 var(--sans);cursor:pointer;box-shadow:0 1px 1px rgba(20,32,74,.12),0 10px 24px -12px rgba(20,32,74,.55)}
button:hover{background:var(--ink-hover)}
button:focus-visible{outline-offset:4px}
.outbox{margin:16px 0 0}
code{color:var(--ink);font:500 .9em/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap}`;

export function authDocument(setup=false,sent=false,localReview=false){
 const title=sent?(localReview?'Check the development outbox':'Check your email'):setup?`Set up ${productName}`:`Sign in to ${productName}`;
 const lead=sent?(localReview?'If this email belongs to an active operator, its sign-in link is in the development outbox. Open the link and confirm to continue. No email was sent.':'If this email belongs to an active operator, a sign-in link has been requested. Open the link and confirm to continue.'):setup?'Use the one-time setup token supplied during installation. Find it in data/local-secrets.json (local installs).':(localReview?'Enter your operator email. Your sign-in link will appear in the development outbox on this computer. No email is sent.':'Enter your operator email to receive a secure sign-in link.');
 const fields=setup?'<label>Setup token<input name="token" type="password" autocomplete="off" required></label><label>Your name<input name="displayName" autocomplete="name" required></label>':'<label>Email address<input name="email" type="email" autocomplete="email" required></label>';
 // Sign-in returns through /setup, which sends a finished owner on to the console at /app.
 const form=`<form method="post" action="${setup?'/auth/bootstrap':'/auth/magic-link'}">${fields}<input type="hidden" name="returnTo" value="/setup"><button>${setup?'Create owner account':'Send sign-in link'}</button></form>${!setup?'<p class="outbox"><a class="text-link" href="/claim">Claim the first owner with an installation token</a></p>':''}${localReview&&!setup?'<p class="outbox"><a class="text-link" href="/__dev/outbox">Open development outbox</a></p>':''}`;
 return new Response(shellDocument({title,style,card:`<h1>${title}</h1><p>${lead.replace('data/local-secrets.json','<code>data/local-secrets.json</code>')}</p>${form}`}),{headers:documentHeaders});
}

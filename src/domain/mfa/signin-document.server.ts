import type {AuthBindings} from '../operator-auth.server.ts'
import {formStyle} from '../auth-document.server.ts'
import {documentHeaders,escapeHtml,productName,shellDocument} from '../document-shell.server.ts'
import {MfaError,type MfaSession} from './policy.server.ts'

// The last step of an owner's sign-in once the account has a second factor. The gate is unchanged: until this session
// holds a proof, every private document and API still refuses it. In place of that refusal an owner's console document
// and /setup show this page at the address they opened. It verifies through the factor door (/api/access/mfa, with its
// replay checks, limits, audit and notices) and then reloads that address (public/assets/second-factor.js).
const style=`${formStyle}
[hidden]{display:none!important}
strong{overflow-wrap:anywhere}
.field-help{margin:-8px 0 18px;color:var(--muted);font-size:15px;line-height:1.5}
[data-factor-status]{margin:0 0 18px;color:var(--ink);font-weight:600}
[data-factor-status]:empty{display:none}
button.secondary{margin-top:12px;background:#fff;color:var(--ink);border:1px solid var(--field-line);box-shadow:none}
button.secondary:hover{background:var(--ground)}
button.link{display:inline-flex;width:auto;min-height:44px;margin:0;padding:0;border-radius:8px;background:none;color:var(--ink);font:600 17px/1.6 var(--sans);text-decoration:underline;text-decoration-color:rgba(20,32,74,.4);text-decoration-thickness:2px;text-underline-offset:5px;box-shadow:none}
button.link:hover{background:none;text-decoration-color:var(--ink)}`

// The step stays hidden until its script runs, so a browser without JavaScript never submits a code to this address.
function secondFactorDocument(displayName:string,head:boolean){
 const body=head?null:shellDocument({title:`Verify your second factor · ${productName}`,style,card:`<h1>Verify your second factor</h1><p>You are signed in as <strong>${escapeHtml(displayName)}</strong>. This account has a second factor, so each new sign-in asks for it before the console opens.</p><div data-factor-step hidden><form data-factor-form><label>Authenticator or recovery code<input name="code" required autocomplete="one-time-code" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="64" aria-describedby="factor-help"></label><p id="factor-help" class="field-help">Enter the six-digit code your authenticator app shows now, or one of the recovery codes you saved when you enrolled.</p><p data-factor-status role="alert"></p><button>Verify and continue</button></form><button type="button" class="secondary" data-factor-passkey hidden>Use a passkey</button><p class="auth-help"><button type="button" class="link" data-factor-signout>Sign out</button></p></div><noscript><p>Turn on JavaScript in this browser to verify your second factor.</p></noscript><script type="module" src="/assets/second-factor.js"></script>`});
 return new Response(body,{status:403,headers:{...documentHeaders,'content-security-policy':`${documentHeaders['content-security-policy']}; script-src 'self'; connect-src 'self'`,'cache-control':'no-store, private',vary:'Cookie','x-content-type-options':'nosniff'}});
}

// Only an owner's refusal for a factor the account enrolled becomes this step; every other refusal keeps its response,
// including an owner the require-all policy holds before any enrollment, who has nothing to verify here.
export async function ownerFactorDocument(env:AuthBindings,session:MfaSession,error:unknown,head:boolean){
 if(!(error instanceof MfaError)||error.code!=='second_factor_required'||session.operator.role!=='owner')return null
 if(!await env.DB.prepare('SELECT 1 FROM uptime_mfa_factors WHERE operator_id=?').bind(session.operator.id).first())return null
 return secondFactorDocument(session.operator.displayName,head)
}

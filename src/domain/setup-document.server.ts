import branding from '../branding.json' with {type:'json'}
import {documentHeaders,escapeHtml,productName,shellDocument} from './document-shell.server.ts'

// One optional field, where checks run from, and the navy pill, on the same card as sign in. The button keeps the literal
// brand accent.
const style=`h1{margin-bottom:28px}
label{display:block;margin:0;color:var(--ink);font-size:15px;font-weight:700;line-height:1.4}
input:not([type=hidden]){display:block;width:100%;min-height:52px;margin:8px 0 14px;padding:12px 16px;border:1px solid var(--field-line);border-radius:12px;background:#fff;color:var(--ink);font:500 17px/1.4 var(--sans)}
input:not([type=hidden]):focus-visible{border-color:var(--ink);outline-offset:2px}
.problem{margin:0 0 20px;color:#8a1f11;font-size:15px;font-weight:600}
.place{display:inline-flex;align-items:center;gap:8px;margin:0 0 24px;padding:6px 14px;border-radius:999px;background:#e6f4ec;color:#22744d;font-size:14px;font-weight:600;line-height:1.4}
.place::before{content:'';width:8px;height:8px;border-radius:50%;background:#3fae7a;flex:none}
button{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;margin:0;padding:0 24px;border:0;border-radius:999px;background:${branding.primaryColor};color:#fff;font:600 17px/1 var(--sans);cursor:pointer;box-shadow:0 1px 1px rgba(20,32,74,.12),0 10px 24px -12px rgba(20,32,74,.55)}
button:hover{background:var(--ink-hover)}
button:focus-visible{outline-offset:4px}
button.skip{width:auto;min-height:44px;margin:12px auto 0;padding:0 16px;background:none;color:var(--ink);font-weight:500;box-shadow:none}
button.skip:hover{background:none;text-decoration:underline;text-underline-offset:5px}`;

// The owner's optional website. `checking` is the address Uptime is already looking at because the installation was set up with one;
// otherwise the page offers the field, keeping what the owner typed and saying why it was refused. `place` names the first
// location once its runner has reached Uptime; `askSite` is false where no runner could check a website yet.
export type StartSite={checking:string}|{entered?:string;problem?:string}
export function setupDocument(displayName:string,site:StartSite={},status=200,{place=null,askSite=true}:{place?:string|null;askSite?:boolean}={}){
 const checking='checking' in site;
 const where=place?`<p class="place">${escapeHtml(checking?`Checking ${site.checking} from ${place}`:`Checking from ${place}`)}</p>`:'';
 const field=checking||!askSite?'':`<label for="start_url">Website to watch (optional)</label><input id="start_url" name="start_url" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="example.com" maxlength="2048" value="${escapeHtml(site.entered??'')}"${site.problem?' aria-invalid="true" aria-describedby="start_url_note"':''}>${site.problem?`<p class="problem" id="start_url_note" role="alert">${escapeHtml(site.problem)}</p>`:''}`;
 const skip=checking||!askSite?'':'<button class="skip" type="submit" name="skip" value="1">Skip</button>';
 return new Response(shellDocument({title:`Set up ${productName}`,style,card:`<h1>Welcome, ${escapeHtml(displayName)}</h1><form method="post" action="/setup">${field}${where}<button type="submit">Continue</button>${skip}</form>`}),{status,headers:{...documentHeaders,'x-content-type-options':'nosniff'}});
}

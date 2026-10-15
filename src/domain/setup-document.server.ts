import branding from '../branding.json' with {type:'json'}
import {documentHeaders,escapeHtml,productName,shellDocument} from './document-shell.server.ts'

// The numbered first steps and the navy pill, on the same card as sign in. The button keeps the literal brand accent.
const style=`ol{margin:0 0 28px;padding-left:22px}
li{margin:0 0 12px;padding-left:4px}
li::marker{color:var(--ink);font-weight:700}
label{display:block;margin:0;color:var(--ink);font-size:15px;font-weight:700;line-height:1.4}
input:not([type=hidden]){display:block;width:100%;min-height:52px;margin:8px 0 10px;padding:12px 16px;border:1px solid var(--field-line);border-radius:12px;background:#fff;color:var(--ink);font:500 17px/1.4 var(--sans)}
input:not([type=hidden]):focus-visible{border-color:var(--ink);outline-offset:2px}
.hint,.problem{margin:0 0 24px;font-size:15px}
.hint{color:var(--muted)}
.problem{color:#8a1f11;font-weight:600}
button{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;margin:0 0 28px;padding:0 24px;border:0;border-radius:999px;background:${branding.primaryColor};color:#fff;font:600 17px/1 var(--sans);cursor:pointer;box-shadow:0 1px 1px rgba(20,32,74,.12),0 10px 24px -12px rgba(20,32,74,.55)}
button:hover{background:var(--ink-hover)}
button:focus-visible{outline-offset:4px}
.proof{margin:8px 0 0;padding-left:18px;font-size:15px}
.proof li{margin:0 0 4px}`;

// Destinations already here (for example after an import) are listed with their alert drill proof, in words only.
const proofText=(d:{state:string;lastProvenAt:number|null})=>d.state==='proven'?`Last proven ${new Date(d.lastProvenAt!).toUTCString()}`:d.state==='stale'?`Not proven in 30 days (last proven ${new Date(d.lastProvenAt!).toUTCString()})`:'Never proven';
const kindText=(kind:string)=>kind==='webhook'?'signed JSON webhook':kind==='slack'?'Slack':'email';

// The owner's optional website. `checking` is the address Uptime is already looking at because the installation was set up with one;
// otherwise the page offers the field, keeping what the owner typed and saying why it was refused.
export type StartSite={checking:string}|{entered?:string;problem?:string}
export function setupDocument(displayName:string,destinations:{name:string;kind:string;state:string;lastProvenAt:number|null}[]=[],site:StartSite={},status=200,external='https://example.org/'){
 const title=`Set up ${productName}`,checking='checking' in site;
 const first=checking
  ?`Uptime is checking ${escapeHtml(site.checking)} from your runner. When you finish setup you will see monitors to start with one click; nothing starts until you choose it. If nothing appears, check that your runner is running.`
  :'Create an HTTP, keyword or heartbeat monitor in the console, or give Uptime a website below and it will propose monitors for it.';
 const field=checking?'':`<label for="start_url">Website to monitor (optional)</label><input id="start_url" name="start_url" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="example.com" maxlength="2048" value="${escapeHtml(site.entered??'')}" aria-describedby="start_url_note"${site.problem?' aria-invalid="true"':''}>${site.problem?`<p class="problem" id="start_url_note" role="alert">${escapeHtml(site.problem)}</p>`:'<p class="hint" id="start_url_note">Uptime checks it from your runner and offers monitors to start with one click. Leave it empty to add monitors yourself.</p>'}`;
 return new Response(shellDocument({title,style,card:`<h1>${title}</h1><p>Welcome, ${escapeHtml(displayName)}. Your owner account is ready.</p><ol><li>${first}</li><li>Hosted public website checks run automatically. For private targets, heartbeats or browser checks, keep a private runner on an authorized host. One runner checks from one network vantage.</li><li>Add a notification destination when you want alerts, then run its alert drill and ask the recipient to confirm it. Missing evidence stays Unknown.${destinations.length?`<ul class="proof">${destinations.map(d=>`<li>${escapeHtml(d.name)} (${kindText(d.kind)}): ${escapeHtml(proofText(d))}</li>`).join('')}</ul>`:''}</li></ol><p>Local development starts the runner and a practice target for you. Hosted website discovery uses a private runner; you can also add public monitors yourself.</p><form method="post" action="/setup">${field}<label for="external_check_url">External check URL</label><input id="external_check_url" name="external_check_url" type="url" required value="${escapeHtml(external)}" aria-describedby="external_check_note"><p class="hint" id="external_check_note">An independent public website used to confirm outages. Choose a different site from the website you monitor. You can also change this on each proposed monitor.</p><button type="submit">Finish setup</button></form><p>You can add and change monitors and notifications in the console.</p>`}),{status,headers:{...documentHeaders,'x-content-type-options':'nosniff'}});
}

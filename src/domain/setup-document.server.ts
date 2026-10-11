import branding from '../branding.json' with {type:'json'}
import {documentHeaders,escapeHtml,productName,shellDocument} from './document-shell.server.ts'

// The numbered first steps and the navy pill, on the same card as sign in. The button keeps the literal brand accent.
const style=`ol{margin:0 0 28px;padding-left:22px}
li{margin:0 0 12px;padding-left:4px}
li::marker{color:var(--ink);font-weight:700}
button{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;margin:0 0 28px;padding:0 24px;border:0;border-radius:999px;background:${branding.primaryColor};color:#fff;font:600 17px/1 var(--sans);cursor:pointer;box-shadow:0 1px 1px rgba(20,32,74,.12),0 10px 24px -12px rgba(20,32,74,.55)}
button:hover{background:var(--ink-hover)}
button:focus-visible{outline-offset:4px}`;

export function setupDocument(displayName:string){
 const title=`Set up ${productName}`;
 return new Response(shellDocument({title,style,card:`<h1>${title}</h1><p>Welcome, ${escapeHtml(displayName)}. Your owner account is ready.</p><ol><li>Create an HTTP, keyword or heartbeat monitor in the console.</li><li>Keep the private runner running on a host authorized to reach your targets. One runner checks from one network vantage.</li><li>Add a notification destination when you want alerts. Missing evidence stays Unknown.</li></ol><p>Local development starts the runner and a practice target for you. Hosted installations need their own runner.</p><form method="post" action="/setup"><button type="submit">Finish setup</button></form><p>You can add and change monitors and notifications in the console.</p>`}),{headers:{...documentHeaders,'x-content-type-options':'nosniff'}});
}

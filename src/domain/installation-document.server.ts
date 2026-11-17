// @ts-ignore Vite raw source for the exact hashed presentation script.
import labelScript from '../ui/installation-label.js?raw'
// @ts-ignore Base's shared CSP helpers are JavaScript.
import {allow,sha256} from '../base/modules/operator-auth/csp.mjs'
import {installationName} from './installation-name.server.ts'
import {escapeHtml} from './document-shell.server.ts'
import type {Bindings} from './control.server.ts'

type Options={testSignIns?:boolean;localLabel?:boolean;reactDocument?:boolean}
// Native documents render their saved name directly. React documents keep
// identical server/client markup and apply it after the owning view hydrates.
export async function installationDocument(env:Bindings,response:Response,{testSignIns=false,localLabel=false,reactDocument=false}:Options={}){
 if(!response.body||!response.headers.get('content-type')?.startsWith('text/html'))return response
 const name=await installationName(env),headers=new Headers(response.headers)
 let html=await response.text()
 const terminalHelp=localLabel&&html.includes('<code>rer dev')
 if(terminalHelp)html=html.replaceAll('<code>rer dev','<code>~/.local/bin/rer dev')
 // Remove the shared local visual suffix together with its title observer.
 if(localLabel)html=html.replace(/<style data-rer-label="Dev"[^>]*>[\s\S]*?<\/style><script>[\s\S]*?<\/script>/g,'').replace(/(<title\b[^>]*>[^<]*) Dev(<\/title>)/g,'$1$2')
 headers.delete('content-length');headers.delete('etag')
 const addLabel=reactDocument&&env.RER_DEMO!=='1'&&!html.includes('data-uptime-brand-script')
 if(addLabel){const policy=headers.get('content-security-policy');if(policy)headers.set('content-security-policy',allow(policy,'script-src',await sha256(labelScript)))}
 const named=new HTMLRewriter()
 if(!reactDocument)named.on('title',{element(element){element.setInnerContent(escapeHtml(name==='Uptime'?name:`${name} · Uptime`),{html:true})}})
  .on('[data-rer-name]',{element(element){element.setInnerContent(name)}})
  .on('.brand',{text(text){if(text.text.trim()==='Uptime')text.replace(name)}})
 if(addLabel)named.on('head',{element(element){element.append(`<script data-uptime-brand-script data-name="${escapeHtml(name)}">${labelScript}</script>`,{html:true})}})
 if(terminalHelp)named.on('main',{element(element){element.append('<details><summary>Details</summary><p>If you see “command not found”, run <code>~/.local/bin/rer cli path</code> and paste the line it prints.</p></details>',{html:true})}})
 if(testSignIns)named.on('h1',{element(element){element.after('<p>Test sign-ins for this computer</p>',{html:true})}})
 return named.transform(new Response(html,{status:response.status,statusText:response.statusText,headers}))
}

// @ts-ignore Vite raw source for the exact hashed presentation script.
import labelScript from '../ui/installation-label.js?raw'
// @ts-ignore Base's shared CSP helpers are JavaScript.
import {allow,sha256} from '../base/modules/operator-auth/csp.mjs'
import {installationName} from './installation-name.server.ts'
import {escapeHtml} from './document-shell.server.ts'
import type {Bindings} from './control.server.ts'

// Edition presentation: local identity remains a gated Base service, while
// installation names come from the owner's saved business settings.
export async function installationDocument(env:Bindings,response:Response,{testSignIns=false,localLabel=false}:{testSignIns?:boolean;localLabel?:boolean}={}){
 if(!response.body||!response.headers.get('content-type')?.startsWith('text/html'))return response
 const name=await installationName(env),headers=new Headers(response.headers)
 let html=await response.text()
 const terminalHelp=localLabel&&html.includes('<code>rer dev')
 if(terminalHelp)html=html.replaceAll('<code>rer dev','<code>~/.local/bin/rer dev')
 // Base's local wrapper adds a visual suffix and its title observer together.
 // This installation uses its saved name instead of that suffix.
 if(localLabel)html=html.replace(/<style data-rer-label="Dev"[^>]*>[\s\S]*?<\/style><script>[\s\S]*?<\/script>/g,'')
 headers.delete('content-length');headers.delete('etag')
 const addLabel=env.RER_DEMO!=='1'&&!html.includes('data-uptime-brand-script')
 if(addLabel){
  const policy=headers.get('content-security-policy');if(policy)headers.set('content-security-policy',allow(policy,'script-src',await sha256(labelScript)))
 }
 const named=new HTMLRewriter().on('html',{element(element){element.setAttribute('data-uptime-installation-name',name)}}).on('title',{element(element){element.setInnerContent(escapeHtml(name==='Uptime'?name:`${name} · Uptime`),{html:true})}})
  .on('[data-rer-name]',{element(element){element.setInnerContent(name)}})
  .on('.brand',{text(text){if(text.text.trim()==='Uptime')text.replace(name)}})
 if(addLabel)named.on('head',{element(element){element.append(`<script data-uptime-brand-script>${labelScript}</script>`,{html:true})}})
 if(terminalHelp)named.on('main',{element(element){element.append('<details><summary>Details</summary><p>If you see “command not found”, run <code>~/.local/bin/rer cli path</code> and paste the line it prints.</p></details>',{html:true})}})
 if(testSignIns)named.on('h1',{element(element){element.after('<p>Test sign-ins for this computer</p>',{html:true})}})
 return named.transform(new Response(html,{status:response.status,statusText:response.statusText,headers}))
}

import {lobbyResponse} from '../base/lobby.ts'
import {identity} from '../identity.ts'
import {authenticatedSession} from './operator-auth.server.ts'
import type {Bindings} from './control.server.ts'
import type {ClaimRead} from '../base/setup-state.ts'

export async function installedLobby(env:Bindings,request:Request,claimed:ClaimRead){
 const response=await lobbyResponse(request,{DB:env.DB,AUTH_ORIGIN:env.UPTIME_ORIGIN!},identity,claimed,r=>authenticatedSession(env,r))
 if(!response?.body)return response
 const html=(await response.text()).replace(/<p class="credit">On this computer,[\s\S]*?<\/p>/,'<p class="credit">Open Uptime: <a href="/login">Open</a></p>')
 const headers=new Headers(response.headers);headers.delete('content-length')
 return new HTMLRewriter().on('.line',{element(element){element.setInnerContent("Uptime checks your site and tells you when it’s down. It does not publish a page for your customers.")}}).transform(new Response(html,{status:response.status,headers}))
}

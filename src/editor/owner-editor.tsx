import {useEffect} from 'react'
import {configLoader,createOwnerEditor} from '../base/modules/editor/index.ts'
import type {Session} from '../base/modules/operator-auth/index.mjs'

/** The native session is rechecked before every short-lived editor grant. */
export function OwnerEditorShell() {
 useEffect(()=>{
  const editor=createOwnerEditor(), controller=new AbortController()
  let identity='', pending=false, stopped=false, generation=0
  const revoke=()=>{generation++;identity='';editor.setOwner(false)}
  const refresh=async()=>{
   if(pending||stopped)return
   pending=true
   const currentGeneration=generation
   try {
    const response=await fetch('/auth/session',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal})
    if(!response.ok){revoke();return}
    const session=await response.json() as Session
    if(currentGeneration!==generation||stopped)return
    if(session.operator?.role!=='owner'){revoke();return}
    const current=JSON.stringify([session.id,session.operator.id])
    if(current!==identity){editor.setOwner(true);identity=current}
    await editor.refresh(configLoader('/api/editor/config',location.origin))
   } catch {if(!stopped)revoke()} finally {pending=false}
  }
  const changed=()=>{revoke();void refresh()}
  const focused=()=>{void refresh()}
  const authorityLost=()=>{revoke()}
  const dispose=()=>{
   if(stopped)return
   stopped=true;generation++;identity='';controller.abort();clearInterval(timer);editor.dispose()
   window.removeEventListener('uptime:auth-changed',changed);window.removeEventListener('uptime:auth-lost',authorityLost);window.removeEventListener('uptime:console-closed',dispose);window.removeEventListener('focus',focused)
  }
  window.addEventListener('uptime:auth-changed',changed)
  window.addEventListener('uptime:auth-lost',authorityLost)
  window.addEventListener('uptime:console-closed',dispose)
  window.addEventListener('focus',focused)
  const timer=setInterval(()=>void refresh(),20_000)
  void refresh()
  return dispose
 },[])
 return null
}

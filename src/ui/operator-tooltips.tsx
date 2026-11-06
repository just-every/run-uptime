import {useEffect} from 'react'
import {loadTooltips} from './tooltip-layer.ts'
// One tooltip layer for the operator's document, mounted with the root route while the path is under /app: the console, a
// monitor's page and the New and Edit monitor forms all swap routes inside this one document, so the layer is never
// remounted by a view. It answers for every control marked by tip() (public/console-format.js) whenever that control is in
// the document, so menus, dialogs and redrawn lists need nothing of their own. It goes when the router leaves /app and when
// the console closes on sign-out, which empties the document's body.
export function OperatorTooltips(){
 useEffect(()=>{
  let remove:(()=>void)|null=null,stopped=false
  const dispose=()=>{stopped=true;remove?.();remove=null}
  void loadTooltips().then(install=>{if(!stopped)remove=install(document)})
  window.addEventListener('uptime:console-closed',dispose)
  return()=>{window.removeEventListener('uptime:console-closed',dispose);dispose()}
 },[])
 return <link rel="stylesheet" href="/assets/tooltip.css" precedence="default"/>
}

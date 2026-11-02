import {loadTooltips} from '../ui/tooltip-layer.ts'
// The Run Edit Run launcher is a button inside the editor widget's shadow root (src/base/modules/editor, Base's copy), which
// the document's tooltip layer cannot reach. This gives that button the same tooltip without editing Base's widget: a layer
// of its own on the widget's shadow root (its tip drawn in the document's body, with the console's colours), the layer's
// marker on the launcher, and its native title removed whenever the widget sets it again, so the two never show together.
// The widget already names the launcher ("Open Run Edit Run" and "Close Run Edit Run"), which is the tooltip's text.
export function launcherTooltip(){
 let remove:(()=>void)|null=null,hosted:HTMLElement|null=null,stopped=false
 const title=new MutationObserver(records=>{for(const {target} of records)(target as Element).removeAttribute('title')})
 const watch=()=>{
  const host=document.querySelector<HTMLElement>('[data-rer-editor]')
  if(host===hosted)return
  remove?.();remove=null;title.disconnect();hosted=host
  const launcher=[...host?.shadowRoot?.children??[]].find(node=>node.tagName==='BUTTON') as HTMLElement|undefined
  if(!host?.shadowRoot||!launcher)return
  launcher.setAttribute('data-tooltip','');launcher.removeAttribute('title')
  title.observe(launcher,{attributes:true,attributeFilter:['title']})
  const root=host.shadowRoot
  void loadTooltips().then(install=>{if(!stopped&&hosted===host)remove=install(root,document.body)})
 }
 const found=new MutationObserver(watch)
 found.observe(document.body,{childList:true})
 watch()
 return()=>{stopped=true;found.disconnect();title.disconnect();remove?.();remove=null}
}

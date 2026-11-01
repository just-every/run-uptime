import {api} from './api.mjs';
import {newMonitorPath,wayPath,manualPath} from '../../ui/monitor-editor-path.mjs';
import {mountServiceCatalog} from './catalog.mjs';
import {mountDiscoverySources} from './sources.mjs';
// New monitor's "Other ways to add": the eyebrow and five named buttons under the website check. One is pressed and open at a
// time; pressing the open one closes it. A panel opens in place under the row and mounts its real module on first open; later
// opens reuse it. The pressed way lives in the path (src/ui/monitor-editor-path.mjs): replaceState, never a push.
export const WAYS=[
 {id:'manual',label:'Fill in the form yourself'},
 {id:'paste',label:'Paste many URLs or a CSV'},
 {id:'file',label:'Import a file'},
 {id:'follow',label:"Follow a service's status"},
 {id:'discover',label:'Discover from DNS, a spec or deploys'},
];
// The console's public files load by their absolute URL, as the console loads them: the dev server would refuse a root-relative
// import of a public file as a module of this bundle.
const publicModule=path=>import(/* @vite-ignore */ new URL(path,location.origin).href);
function stylesheet(href){
 if(document.querySelector(`link[href="${href}"]`))return Promise.resolve();
 const link=Object.assign(document.createElement('link'),{rel:'stylesheet',href});
 const loaded=new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=()=>reject(Error(`${href} did not load`))});
 document.head.append(link);return loaded;
}
// The panel's own live status line is the first role=status inside it. A step shows its pending line, then its success or the
// server's own error there; nothing is swallowed. The result is what the console's action returns: {accepted,ok,result}.
const panelAction=host=>async(task,{pending='Working…',success='Done.'}={})=>{
 const line=host.querySelector('[role=status]');
 if(line){line.textContent=pending;line.dataset.state='working'}
 try{const result=await task();if(line){line.textContent=typeof success==='function'?success(result):success;line.dataset.state='success'}return {accepted:true,ok:true,result}}
 catch(error){if(line){line.textContent=error.message;line.dataset.state='error'}return {accepted:true,ok:false}}
};
const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
export function mountWays({root,form,overview,signal,openForm}){
 const row=element('div','way-row'),panels=new Map(),mounted=new Map(),buttons=new Map(),eyebrow=element('p','ui-eyebrow','Other ways to add');
 eyebrow.id='other-ways-heading';row.setAttribute('role','group');row.setAttribute('aria-labelledby','other-ways-heading');
 const shelf=element('div','way-panels');
 const mounts={
  async paste(host){
   const [{mountBulkAdd}]=await Promise.all([publicModule('/catalog-dialogs.js'),stylesheet('/catalog.css')]);
   const {runner}=await overview;mountBulkAdd(host,{api,action:panelAction(host),runners:runner.runners});
  },
  async file(host){
   const {mountImport}=await publicModule('/definitions.js');
   host.innerHTML='<div class="card-head"><h2>Import a file</h2></div>';
   const part=element('section','definition-input');host.append(part);mountImport(part,{action:panelAction(host)});
  },
  async follow(host){signal.addEventListener('abort',mountServiceCatalog({overview:await overview,host}),{once:true})},
  async discover(host){signal.addEventListener('abort',mountDiscoverySources({overview:await overview,host}),{once:true})},
 };
 let current=null;
 const show=way=>{
  current=way;
  for(const [id,button] of buttons)button.setAttribute('aria-pressed',String(id===way));
  for(const [id,panel] of panels)panel.hidden=id!==way;
 };
 const panelFor=way=>{
  if(panels.has(way))return panels.get(way);
  const panel=element('section','way-panel');panel.dataset.way=way;panel.hidden=true;
  if(way==='manual'){
   // The form is the panel: the same #monitor-form, moved under the row, with the pill's name as its heading.
   const heading=element('h2','way-heading','Fill in the form yourself');panel.append(heading,form);form.hidden=false;
  }
  panels.set(way,panel);shelf.append(panel);return panel;
 };
 async function mount(way){
  if(way==='manual'||mounted.has(way))return;
  // Paste and Import are cards of their own; Follow and Discover mount the card their module draws.
  const panel=panelFor(way),host=element('div',way==='paste'||way==='file'?'way-host ui-card':'way-host');host.dataset.way=way;panel.append(host);
  const work=mounts[way](host).catch(error=>{
   host.replaceChildren(Object.assign(element('p','ui-callout error',`${WAYS.find(item=>item.id===way).label} could not open: ${error.message}`),{role:'alert'}));
   mounted.delete(way);
  });
  mounted.set(way,work);
  await work;
 }
 function open(way,{path}={}){
  panelFor(way);show(way);
  history.replaceState(history.state,'',path??(way==='manual'?manualPath():wayPath(way)));
  void mount(way);
 }
 function close(){
  if(!current)return;
  show(null);history.replaceState(history.state,'',newMonitorPath);
 }
 for(const {id,label} of WAYS){
  const button=element('button','way-pill',label);button.type='button';button.setAttribute('aria-pressed','false');button.dataset.way=id;
  button.addEventListener('click',()=>{if(current===id)close();else if(id==='manual')openForm();else open(id)});
  buttons.set(id,button);row.append(button);
 }
 root.replaceChildren(eyebrow,row,shelf);root.hidden=false;
 return {open,close,get current(){return current}};
}

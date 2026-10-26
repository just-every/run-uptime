import {FOLD_IDS} from './monitor-folds.js';
// Links into a monitor's page: a fold's id (/app/monitors/<id>#alerts), or anything inside the page, such as an alert email's
// /app/monitors/<id>#incident-<key> (src/domain/notification-context.ts) or a check's #history-<slot>. A link opens the fold
// and every disclosure holding its target, then scrolls to it, on a fresh document and as a same-page link.
export const linkTarget=()=>{try{return decodeURIComponent(location.hash.slice(1))||null}catch{return null}};
// A fold's panel mounts on its first open, through its own bind function.
export function openFold(page,id,{show=true}={}){
 const fold=page.area.querySelector(`details.fold#${CSS.escape(id)}`);if(!fold)return null;
 if(!page.ui.mounted.has(id)){page.ui.mounted.add(id);page.draw();page.folds.find(f=>f.id===id)?.mount?.(page.area,page.deps());if(id==='snapshots')countSnapshots(page)}
 if(show)fold.open=true;
 return fold;
}
// The snapshot count for its fold's summary, read once when the fold first opens.
function countSnapshots(page){
 page.api(`/api/monitors/${encodeURIComponent(page.m.id)}/failure-snapshots`).then(data=>{page.seen.snapshots={count:data.items.length,more:Boolean(data.next)};page.draw()},()=>{});
}
// Scrolls to the target, and again once the page's first reads have drawn (they fill the status card, the table and Recent
// checks above it, and would leave it out of view). A link on a fresh document is followed in the page's first draw, before
// those reads have started.
function bringIntoView(page,element){
 requestAnimationFrame(()=>element.isConnected&&element.scrollIntoView({block:'start'}));
 if(!page.ui.started||page.ui.reading?.size)page.ui.settle=element.id;
}
export function settleLink(page){
 const id=page.ui.settle;if(!id||page.ui.reading?.size)return;
 page.ui.settle=null;const element=document.getElementById(id);
 if(element&&page.area.contains(element))requestAnimationFrame(()=>element.scrollIntoView({block:'start'}));
}
// A target inside a fold not mounted yet is looked for with every fold's markup drawn once (probing); a target that comes
// with a read (an incident, a check) waits for the page's first reads before it gives up.
export function followLink(page){
 const {ui,area}=page,target=ui.hash;if(!target)return;
 if(FOLD_IDS.includes(target)){
  if(!area.querySelector(`details.fold#${CSS.escape(target)}`)){if(ui.reading&&!ui.reading.size)ui.hash=null;return}
  ui.hash=null;bringIntoView(page,openFold(page,target));
  return;
 }
 const element=document.getElementById(target);
 if(!element||!area.contains(element)){
  if(!ui.probing&&page.folds.some(f=>!f.always&&!ui.mounted.has(f.id))){ui.probing=true;queueMicrotask(()=>page.draw())}
  else if(ui.reading&&!ui.reading.size){ui.hash=null;if(ui.probing){ui.probing=false;queueMicrotask(()=>page.draw())}}
  return;
 }
 ui.hash=null;
 const fold=element.closest('details.fold');
 if(ui.probing){ui.probing=false;if(fold&&!fold.open)openFold(page,fold.id,{show:false});else page.draw()}
 const found=document.getElementById(target);if(!found)return;
 for(let node=found;node&&node!==area;node=node.parentElement)if(node.localName==='details')node.open=true;
 bringIntoView(page,found);
}

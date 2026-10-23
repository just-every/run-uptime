import {api} from './api.mjs';
// An empty list opens this page, so its first-monitor links hold the list's door to the console's own Bulk add dialog
// (public/catalog-dialogs.js) too, until New monitor's "Other ways to add" holds it as "Paste many URLs or a CSV";
// U21 round R3's "Other ways to add" commit removes this module, its button and the dialog's onClosed.
const DIALOG='/catalog-dialogs.js',STYLES='/catalog.css';
// The dialog's styles, added as the console adds them (public/app.js), loaded before it opens.
function styles(){
 if(document.querySelector(`link[href="${STYLES}"]`))return Promise.resolve();
 const link=Object.assign(document.createElement('link'),{rel:'stylesheet',href:STYLES});
 const loaded=new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=()=>reject(Error(`${STYLES} did not load`))});
 document.head.append(link);return loaded;
}
// The dialog shows a refused request's message itself, so a request only reports whether it succeeded.
const run=async task=>{try{return {accepted:true,ok:true,result:await task()}}catch{return {accepted:true,ok:false}}};
export function mountAddMany(button,{runners,notice}){
 let opening=false;
 button.onclick=async()=>{
  if(opening)return;opening=true;
  try{
   // By its absolute URL, so it loads as the console's public file it is: the dev server would refuse a root-relative
   // import of a public file as a module of this bundle.
   const [{openCatalogDialog}]=await Promise.all([import(/* @vite-ignore */ new URL(DIALOG,location.origin).href),styles()]);
   // Once a batch applies, closing the dialog opens the list with the new monitors, unless its Archive link left already.
   let applied=false;
   openCatalogDialog({api,action:run,kind:'add',runners,onApplied:()=>{applied=true},onClosed:()=>{if(applied)setTimeout(()=>{if(location.pathname.startsWith('/app/monitors/new'))location.href='/app/monitors'})}});
  }catch(error){notice.textContent=`Bulk add could not open: ${error.message}`;notice.hidden=false}
  finally{opening=false}
 };
}

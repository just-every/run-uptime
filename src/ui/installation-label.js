// The view signals after hydration, before installation branding touches the
// static markup. Later editor/header mounts and router titles use the same name.
(()=>{
 let observer;
 const update=()=>{
  const name=document.querySelector('script[data-uptime-brand-script]')?.dataset.name;
  if(!name)return;
  const title=name==='Uptime'?name:`${name} · Uptime`;
  if(document.title!==title)document.title=title;
  for(const label of document.querySelectorAll('[data-rer-name]'))if(label.textContent!==name)label.textContent=name;
 };
 document.addEventListener('uptime:brand-ready',()=>{
  if(!observer){observer=new MutationObserver(update);observer.observe(document,{childList:true,subtree:true,characterData:true})}
  update();
 });
})();

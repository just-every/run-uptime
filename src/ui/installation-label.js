// Read the saved name as data, including after a General settings change.
// Router head updates and newly mounted editor headers use that same name.
(()=>{
 const update=()=>{
  const name=document.documentElement.dataset.uptimeInstallationName;
  if(!name)return;
  const title=name==='Uptime'?name:`${name} · Uptime`;
  if(document.title!==title)document.title=title;
  for(const label of document.querySelectorAll('[data-rer-name]'))if(label.textContent!==name)label.textContent=name;
 };
 update();new MutationObserver(update).observe(document,{childList:true,subtree:true,characterData:true});
})();

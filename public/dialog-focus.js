// Periodic console redraws can replace the opener while a native dialog is
// open. Restore the current control with the same id when that happens.
export function dialogFocusReturn(fallbackId) {
 const opener=document.activeElement,id=opener?.id||fallbackId;
 return ()=>{
  if(document.querySelector('dialog[open]'))return;
  const control=opener?.isConnected&&opener!==document.body&&!opener.closest('dialog')?opener:id?document.getElementById(id):null;
  control?.focus({preventScroll:true});
 };
}

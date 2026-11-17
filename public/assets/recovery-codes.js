// Keep the issued values intact for copying, downloading and later verification.
export function showRecoveryCodes(host,values,onSaved=()=>host.replaceChildren()){
 host.replaceChildren();
 const heading=document.createElement('h3'),help=document.createElement('p'),codes=document.createElement('pre'),actions=document.createElement('div'),copy=document.createElement('button'),download=document.createElement('button'),saved=document.createElement('button'),status=document.createElement('p');
 heading.textContent='Save your recovery codes';
 help.textContent=`Keep these ${values.length} codes somewhere you can reach without your phone. Use one after signing in if your authenticator or passkey is unavailable. Each works once. You cannot view them here again after closing.`;
 codes.dataset.recoveryCodes='';codes.textContent=values.join('\n');
 actions.className='buttons';status.setAttribute('role','status');status.dataset.recoveryStatus='';
 copy.type=download.type=saved.type='button';copy.textContent='Copy all';download.textContent='Download';saved.textContent='I saved this';saved.dataset.recoverySaved='';
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(codes.textContent+'\n');if(host.isConnected)status.textContent='Codes copied. Keep them somewhere safe.'}catch{if(host.isConnected)status.textContent='Copy could not complete. Select and copy the codes above, or download them.'}};
 download.onclick=()=>{const url=URL.createObjectURL(new Blob([codes.textContent+'\n'],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='uptime-recovery-codes.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),0)};
 saved.onclick=onSaved;actions.append(copy,download,saved);host.append(heading,help,codes,actions,status);
 return saved;
}

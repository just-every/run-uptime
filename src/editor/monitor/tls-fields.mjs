// Certificate trust and a secret-free reference to runner-local request credentials.
const field=(root,name)=>root.querySelector(`[name="${name}"]`);
export function showTlsFields(root){
 const mode=field(root,'tlsTrustMode');if(!mode)return;
 const http=(field(root,'checkType')?.value??'http')==='http';
 const https=http&&/^https:\/\//i.test(field(root,'url')?.value??'');
 if(!https)mode.value='default';mode.disabled=!https;
 for(const item of root.querySelectorAll('[data-trust-mode]')){
  const shown=https&&item.dataset.trustMode===mode.value;item.hidden=!shown;
  for(const control of item.querySelectorAll('input,textarea')){control.disabled=!shown;control.required=shown}
 }
 const help=root.querySelector('[data-trust-help]');if(help)help.textContent=https?'Exceptions require a private runner. Other origins always use full certificate verification.':'Certificate exceptions are available only for public HTTPS website/API checks.';
}
export function fillTlsFields(root,definition){
 const mode=field(root,'tlsTrustMode');if(!mode)return;
 mode.value=definition.tlsTrust?.mode??'default';
 field(root,'tlsFingerprint').value=definition.tlsTrust?.sha256??'';
 field(root,'tlsCaCertificate').value=definition.tlsTrust?.certificate??'';
 field(root,'tlsIgnoreConsent').checked=definition.tlsTrust?.mode==='ignore'&&definition.tlsTrust.acknowledged===true;
 field(root,'credentialRef').value=definition.request?.credentialRef??'';
 mode.onchange=()=>showTlsFields(root);field(root,'url').oninput=()=>showTlsFields(root);
}
export function readTlsFields(root){
 const mode=field(root,'tlsTrustMode')?.value??'default',reference=field(root,'credentialRef')?.value.trim();
 let tlsTrust;
 if(mode==='fingerprint')tlsTrust={mode,sha256:field(root,'tlsFingerprint').value.trim()};
 else if(mode==='ca')tlsTrust={mode,certificate:field(root,'tlsCaCertificate').value.trim()};
 else if(mode==='ignore'){
  if(!field(root,'tlsIgnoreConsent').checked)throw Error('Confirm the certificate verification warning before ignoring errors.');
  tlsTrust={mode,acknowledged:true};
 }
 return {...(tlsTrust?{tlsTrust}:{}),...(reference?{request:{credentialRef:reference}}:{})};
}

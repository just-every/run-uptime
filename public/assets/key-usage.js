// Usage instructions contain placeholders only; the issued key stays in the
// existing shown-once field and is cleared with that panel.
export function keyUsage(ci){
 const help=document.createElement('div');help.dataset.keyUsage='';
 const address=document.createElement('p'),url=document.createElement('code');
 address.append('Read API address: ');url.textContent=new URL('/api/v1',location.origin).href;url.dataset.readApiAddress='';address.append(url);
 const authorization=document.createElement('code');authorization.textContent='Authorization: Bearer <YOUR_KEY>';authorization.dataset.authorizationExample='';
 const example=document.createElement('p');example.append(authorization);
 const paragraph=document.createElement('p'),guide=document.createElement('a');guide.href='/docs/read-api';guide.textContent='Read API guide';paragraph.append(guide);
 help.append(address,example,paragraph);
 if(ci){
  const scope=document.createElement('p'),definitions=document.createElement('a');
  scope.append('This CI key authorizes definition operations, not monitoring reads. ');definitions.href='/docs/definitions#ci-credentials';definitions.textContent='CI credential instructions';scope.append(definitions);help.append(scope);
 }
 return help;
}

// Installer mechanics are defined here once; application bindings belong in SETUP.
export const hostingKeys = ['target', 'accountId', 'prefix', 'appOrigin', 'apiToken'];
export function installerInputs({hosting=false, ownerBootstrap=false}={}) {
 const fields={},groups=[],secretScopes={};
 const nonempty=value=>typeof value==='string'&&Boolean(value.trim());
 if(ownerBootstrap){
  fields.displayName={label:'Your name',help:'Shown as the first owner of this installation.',valid:value=>nonempty(value)&&value.length<=120};
  groups.push({id:'local-owner',title:'First owner',keys:['displayName']});
 }
 if(hosting){
  Object.assign(fields,{
   target:{label:'Where should the workspace run?',options:[['local','On this computer'],['remote','Online for your team']],valid:value=>['local','remote'].includes(value)},
   accountId:{label:'Cloudflare account',optional:true,valid:value=>/^[a-f0-9]{32}$/i.test(value||'')},
   prefix:{label:'Resource name',optional:true,valid:value=>/^[a-z][a-z0-9-]{2,39}$/.test(value||'')},
   appOrigin:{label:'Workspace address',optional:true,type:'url',valid:value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.href.includes('?')&&!url.href.includes('#')&&url.origin===value;}catch{return false;}}},
   apiToken:{label:'Cloudflare API token',optional:true,type:'password',valid:nonempty},
   prefixMode:{optional:true,valid:value=>['automatic','custom'].includes(value)},
   addressMode:{optional:true,valid:value=>['automatic','custom'].includes(value)},
  });
  secretScopes.apiToken=['accountId'];
  groups.push({id:'hosting',title:'Hosting & connections',kind:'hosting',keys:hostingKeys});
 }
 return {fields,groups,secretScopes};
}

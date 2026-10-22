import {metricsSection} from './metrics.js';
import {businessImportSettings} from './business-import-settings.js';
import {confirmErasure,showErasureReceipt} from './notification-dialogs.js';
import {patch,firstMount} from './dom-patch.js';
// Settings (/app/settings): the installation-wide settings that are not one of the owner's three jobs: the External check
// URL, metrics keys, operator accounts and Business imports. Each section is data-owned and filled once by its module, so
// the console's refresh keeps a draft, an open disclosure or a pending request.
export function renderSettings({area,data,api,action,refresh,notice,closeConsole,navigateToLogin,closed}){
 patch(area,'<section class="empty section-panel settings-panel"><section class="external-check" id="external-check" data-owned="external-check"></section><section class="metrics-tools" id="metrics-tools" data-owned="metrics"></section><section class="operator-tools" id="operator-tools" data-owned="operator-tools" aria-labelledby="operators-heading" hidden><h3 id="operators-heading">Operator accounts</h3><p>The last active owner cannot be erased.</p><button id="load-operators">Manage operators</button><div id="operators" data-owned="operators"></div></section><section id="business-import-settings" aria-labelledby="business-import-heading" data-owned="business-import"></section></section>');
 const external=area.querySelector('#external-check'),metrics=area.querySelector('#metrics-tools');
 if(firstMount(external))import('./external-check.js').then(({externalCheckSection})=>externalCheckSection(external,{url:data.runner.externalCheckUrl,api,refresh}));
 if(firstMount(metrics))metricsSection(metrics,api);
 businessImportSettings(area.querySelector('#business-import-settings'),api);
 async function eraseOperator(operator){
  const result=await action(()=>api(`/api/operators/${encodeURIComponent(operator.id)}/erase`,'POST',{}),{pending:'Erasing operator…',success:'Operator and local sign-in records erased.',onSuccess:result=>{
   if(result.selfErased){closeConsole();showErasureReceipt(result.receipt,{onClose:navigateToLogin})}
  }});
  if(result.ok&&!closed()){showErasureReceipt(result.result.receipt);await loadOperators(true);}
 }
 const section=area.querySelector('#operator-tools');
 async function loadOperators(show=false){
  try{
   const operators=await api('/auth/operators');if(!section.isConnected)return;
   section.hidden=operators.length<=1;
   if(!show)return;
   const host=section.querySelector('#operators');host.replaceChildren();
   const owners=operators.filter(operator=>operator.role==='owner'&&operator.status==='active').length;
   for(const operator of operators){
    const row=document.createElement('p'),label=document.createElement('span'),button=document.createElement('button');
    label.textContent=`${operator.displayName} (${operator.email}) · ${operator.role} `;
    button.id='erase-operator-'+operator.id;button.textContent='Erase operator';
    button.onclick=()=>confirmErasure({kind:'operator',name:operator.email,onConfirm:()=>eraseOperator(operator)});
    row.className='operator-row';row.append(label);
    if(!(operator.role==='owner'&&operator.status==='active'&&owners===1))row.append(button);
    host.append(row);
   }
  }catch(error){notice(error.message)}
 }
 if(firstMount(section)){section.querySelector('#load-operators').onclick=()=>loadOperators(true);void loadOperators();}
}

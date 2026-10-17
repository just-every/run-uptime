import {dialogFocusReturn} from './notification-dialogs.js';
const field=(root,name)=>root.querySelector(`[name="${name}"]`);
const defaults='{"monitor":"*monitorFriendlyName*","type":"*alertType*","details":"*alertDetails*","event":"{{event.id}}"}';
export function showWebhookPreview(value){
 const returnFocus=dialogFocusReturn(),dialog=document.createElement('dialog');dialog.className='editor notification-dialog webhook-preview';dialog.setAttribute('aria-labelledby','webhook-preview-title');
 const heading=document.createElement('h2');heading.id='webhook-preview-title';heading.textContent='Request preview';heading.tabIndex=-1;dialog.append(heading);
 const help=document.createElement('p');help.textContent='Sample events only. Destination URLs are visible here; header secrets and signatures are masked. The selected method, payload and parameter encoding match delivery.';dialog.append(help);
 for(const warning of value.warnings??[]){const p=document.createElement('p');p.className='ui-callout warning';p.textContent=`${warning.variable}: ${warning.reason}`;dialog.append(p)}
 for(const sample of value.samples){const section=document.createElement('section'),title=document.createElement('h3'),pre=document.createElement('pre');title.textContent=sample.kind.charAt(0).toUpperCase()+sample.kind.slice(1);pre.textContent=JSON.stringify(sample.request,null,2);section.append(title,pre);dialog.append(section)}
 const close=document.createElement('button');close.type='button';close.textContent='Close preview';close.onclick=()=>dialog.close();dialog.append(close);dialog.onclose=()=>{dialog.remove();returnFocus()};document.body.append(dialog);dialog.showModal();dialog.scrollTop=0;heading.focus({preventScroll:true});
}
export function mountWebhookEditor(form,{destination,api}){
 const panel=document.createElement('section');panel.className='webhook-editor';
 panel.innerHTML=`<h3>Webhook request</h3><label>Request format<select name="webhookFormat"><option value="default">Default signed JSON envelope</option><option value="custom">Custom request template</option></select></label>
 <div data-custom-webhook hidden><div class="webhook-pair"><label>HTTP method<select name="webhookMethod"><option>POST</option><option>GET</option><option>PUT</option><option>PATCH</option></select></label><label>Delivery mode<select name="webhookMode"><option value="json">JSON body</option><option value="form">Form fields</option><option value="query">Query parameters</option></select></label></div>
 <label>Payload or parameter template<textarea name="webhookPayload" rows="5" spellcheck="false" maxlength="32768"></textarea></label><p class="ui-helper">JSON: use variables as values, or inside quoted strings for combined text. Form/query: use a JSON object of string fields. Values are escaped for their destination. GET sends query parameters and no body. <a href="/docs/webhooks" target="_blank" rel="noopener">Variables and examples</a></p>
 <label>Owner time zone<input name="webhookTimeZone" value="America/Chicago" placeholder="America/Chicago"></label>
 <label>Custom header values (JSON)<textarea name="webhookHeaders" rows="3" autocomplete="off" spellcheck="false" placeholder='{"X-Api-Key":"enter locally"}'></textarea></label><p class="ui-helper" data-header-help>Up to 10 headers, 4 KiB total. Values are encrypted locally and omitted from archives. Use {{event.id}} for an idempotency header. They are masked after save. Enter {} to remove saved custom headers.</p>
 <label class="enabled-control"><input name="webhookSigning" type="checkbox" checked> Sign the exact request bytes with HMAC-SHA256</label></div>
 <div class="webhook-preview-controls"><button type="button" data-preview-webhook>Preview sample requests</button><a href="/docs/webhooks" target="_blank" rel="noopener">Webhook guide</a></div>
 <details class="webhook-source"><summary>Import a saved UptimeRobot webhook definition</summary><p class="ui-helper">Use a documented saved create payload. Opaque integration detail responses and unsupported delivery combinations are refused. Source header values are discarded; enter them again locally.</p><label>Saved webhook JSON<textarea name="webhookImport" rows="4" spellcheck="false"></textarea></label><button type="button" data-import-webhook>Read source definition</button></details><p class="form-error" role="alert" data-webhook-error></p><ul class="webhook-differences" data-webhook-differences></ul>`;
 form.querySelector('.enabled-control').before(panel);
 const config=destination?.webhookTemplate;
 field(panel,'webhookFormat').value=config?'custom':'default';field(panel,'webhookMethod').value=config?.method??'POST';field(panel,'webhookMode').value=config?.mode??'json';field(panel,'webhookPayload').value=config?(config.mode==='json'?config.template:JSON.stringify(config.template,null,2)):defaults;field(panel,'webhookTimeZone').value=config?.timeZone??'America/Chicago';field(panel,'webhookSigning').checked=destination?.webhookSigning!==false;
 if(config?.headerNames.length)panel.querySelector('[data-header-help]').textContent=`Saved header names: ${config.headerNames.join(', ')}. Values are masked. Leave blank to keep them; enter a complete JSON object to replace them, or {} to remove them.`;
 let importedNames;
 const error=message=>{const node=panel.querySelector('[data-webhook-error]');node.textContent=message;if(message)node.scrollIntoView({block:'nearest'})};
 const enabled=()=>{const visible=(destination?.kind??form.elements.kind?.value)==='webhook';panel.hidden=!visible;const custom=field(panel,'webhookFormat').value==='custom';panel.querySelector('[data-custom-webhook]').hidden=!custom;for(const input of panel.querySelectorAll('[data-custom-webhook] input,[data-custom-webhook] select,[data-custom-webhook] textarea'))input.disabled=!visible||!custom};
 field(panel,'webhookFormat').onchange=enabled;field(panel,'webhookMethod').onchange=()=>{if(field(panel,'webhookMethod').value==='GET')field(panel,'webhookMode').value='query'};
 const read=()=>{
  if(panel.hidden)return {};
  if(field(panel,'webhookFormat').value==='default')return {webhookTemplate:null};
  const raw=field(panel,'webhookHeaders').value.trim(),headers=raw?JSON.parse(raw):undefined;
  if(headers!==undefined&&(!headers||typeof headers!=='object'||Array.isArray(headers)||Object.values(headers).some(v=>typeof v!=='string')))throw Error('Custom headers must be a JSON object of string values.');
  const mode=field(panel,'webhookMode').value;
  const webhookTemplate={version:1,method:field(panel,'webhookMethod').value,mode,template:mode==='json'?field(panel,'webhookPayload').value:JSON.parse(field(panel,'webhookPayload').value),headerNames:headers?Object.keys(headers):importedNames??config?.headerNames??[],timeZone:field(panel,'webhookTimeZone').value.trim()};
  return {webhookTemplate,webhookSigning:field(panel,'webhookSigning').checked,...(headers!==undefined?{webhookHeaders:headers}:{})};
 };
 panel.querySelector('[data-preview-webhook]').onclick=async()=>{error('');try{const values=read(),url=form.elements.url?.value.trim();if(url)values.url=url;const path=destination?`/api/notifications/destinations/${encodeURIComponent(destination.id)}/preview`:'/api/notifications/webhook-preview';showWebhookPreview(await api(path,'POST',values))}catch(e){error(e.message)}};
 panel.querySelector('[data-import-webhook]').onclick=async()=>{error('');try{
  const proposal=await api('/api/notifications/webhook-import-preview','POST',JSON.parse(field(panel,'webhookImport').value));form.elements.name.value=proposal.name;form.elements.url.value=proposal.url;field(panel,'webhookFormat').value='custom';field(panel,'webhookMethod').value=proposal.webhookTemplate.method;field(panel,'webhookMode').value=proposal.webhookTemplate.mode;field(panel,'webhookPayload').value=proposal.webhookTemplate.mode==='json'?proposal.webhookTemplate.template:JSON.stringify(proposal.webhookTemplate.template,null,2);field(panel,'webhookTimeZone').value=proposal.webhookTemplate.timeZone;field(panel,'webhookHeaders').value='';importedNames=proposal.headerNames;field(panel,'webhookImport').value='';panel.querySelector('[data-header-help]').textContent=importedNames.length?`Re-enter these header values locally as JSON: ${importedNames.join(', ')}.`:'No custom source headers.';
  const list=panel.querySelector('[data-webhook-differences]');list.replaceChildren();for(const text of [...proposal.differences,...proposal.warnings.map(w=>`${w.variable}: ${w.reason}`)]){const li=document.createElement('li');li.textContent=text;list.append(li)}enabled();
 }catch(e){error(e.message)}};
 enabled();
 return {read,update:enabled,clear:()=>{for(const text of panel.querySelectorAll('textarea'))text.value='';panel.remove()}};
}

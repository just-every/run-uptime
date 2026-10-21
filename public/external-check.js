// Settings: the installation-wide External check URL. A page the owner does not run, checked from the same location, so a
// problem on the owner's own network is not reported as an outage. Every monitor follows it from its next check, unless the
// monitor has its own under Advanced. The last outcome stays beside the field until the next save, and survives the console's
// periodic redraw.
let outcome=null;
export function externalCheckSection(section,{url,api,refresh}){
 const heading=document.createElement('h3'),help=document.createElement('p'),form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),button=document.createElement('button'),status=document.createElement('p');
 heading.id='external-check-heading';heading.textContent='External check';
 help.id='external-check-help';help.textContent='A site you do not run. A monitor checked from one location is down only while this site still loads from there.';
 form.id='external-check-form';form.noValidate=true;
 input.id='external-check-url';input.name='externalCheckUrl';input.type='text';input.inputMode='url';input.autocomplete='off';input.autocapitalize='off';input.spellcheck=false;input.required=true;input.value=url??'';input.setAttribute('aria-describedby','external-check-help external-check-status');
 label.htmlFor=input.id;label.textContent='External check URL';
 button.type='submit';button.textContent='Save';
 status.id='external-check-status';status.setAttribute('role','status');
 const show=()=>{status.hidden=!outcome;status.className=outcome?`ui-callout${outcome.error?' error':''}`:'';status.textContent=outcome?.text??'';input.toggleAttribute('aria-invalid',Boolean(outcome?.error));if(!outcome?.error)input.removeAttribute('aria-invalid')};
 show();
 const row=document.createElement('div');row.className='external-check-row';row.append(input,button);
 form.append(label,row,status);section.setAttribute('aria-labelledby',heading.id);section.replaceChildren(heading,help,form);
 form.onsubmit=async event=>{
  event.preventDefault();button.disabled=true;outcome={text:'Saving…'};show();
  try{const saved=await api('/api/external-check','POST',{url:input.value});input.value=saved.url;outcome={text:`Saved. Monitors use it from their next check${saved.own?`; ${saved.own===1?'1 monitor keeps its own':`${saved.own} monitors keep their own`}`:''}.`}}
  catch(error){outcome={error:true,text:error.message}}
  show();button.disabled=false;
  if(!outcome.error)await refresh();
 };
}

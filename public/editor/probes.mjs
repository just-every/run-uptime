// The full form's "Checks to include": up to three checks, each with the runner that performs it and an optional external
// check URL that overrides the installation's External check URL (shown as the field's placeholder).
export function mountProbeControls(probes,overview,definition,monitorId){
 for(const [index,name] of ['local-a','local-b','local-c'].entries()){
  const group=document.createElement('div');group.className='probe-assignment';probes.append(group);
  const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.name='probes';input.value=name;input.checked=definition.probes.includes(name);input.disabled=true;label.append(input,document.createTextNode(`Check ${index+1}`));group.append(label);
  const runnerLabel=document.createElement('label'),select=document.createElement('select');runnerLabel.textContent=`Runner for check ${index+1}`;select.name=`runner-${name}`;
  for(const row of overview.runner.runners??[]){if(row.revokedAt)continue;const option=document.createElement('option');option.value=row.runnerId;option.textContent=`${row.networkLabel} · ${row.runnerId.slice(5,13)}`;select.append(option)}
  if(definition.assignments?.[name])select.value=definition.assignments[name].runnerId;
  runnerLabel.append(select);group.append(runnerLabel);
  const canaryLabel=document.createElement('label'),canary=document.createElement('input');canaryLabel.textContent=`External check URL for check ${index+1} (optional)`;canary.type='url';canary.placeholder=overview.runner.externalCheckUrl??'';canary.name=`canary-${name}`;canary.value=definition.assignments?.[name]?.canaryUrl??'';canaryLabel.append(canary);group.append(canaryLabel);
  input.onchange=()=>{select.required=input.checked;select.disabled=canary.disabled=!input.checked};
 }
 const count=document.createElement('p'),active=monitorId?overview.monitors.find(m=>m.id===monitorId)?.activeVantages??0:0;count.textContent=`${active} runner ${active===1?'network':'networks'} active. With one network, a check is confirmed by an external check URL: the one you set here, or the installation's${overview.runner.externalCheckUrl?` (${overview.runner.externalCheckUrl})`:''} External check URL, which you can change on Runner / archive.`;probes.append(count);
 return probes;
}

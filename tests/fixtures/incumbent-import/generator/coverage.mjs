// Matches documented paths to generated source bytes, independently of any
// production importer. It records paths/types only, never secret fixture values.
function csvRows(text){
 const rows=[];let row=[],cell='',quoted=false
 for(let i=0;i<text.length;i++){
  const char=text[i]
  if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
  else if(char===','&&!quoted){row.push(cell);cell=''}
  else if(char==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));if(row.some(Boolean))rows.push(row);row=[];cell=''}
  else cell+=char
 }
 if(cell||row.length){row.push(cell);rows.push(row)}
 const [headers,...body]=rows
 return body.map(values=>Object.fromEntries(headers.map((header,i)=>[header,values[i]])))
}

export function documentedCoverage(files,csv){
 const index=new Map()
 const note=(shape,value,file,sourcePath,normalizedRoot='')=>{
  const visit=(current,path,actual)=>{
   if(path){const key=`${shape}\0${path}`,refs=index.get(key)??[];if(refs.length<3&&!refs.some(v=>v.file===file&&v.path===actual))refs.push({file,path:actual,type:Array.isArray(current)?'array':current===null?'null':typeof current});index.set(key,refs)}
   if(Array.isArray(current)){if(!current.length)index.set(`${shape}\0${path}[]`,[{file,path:actual,type:'empty-array'}]);for(let i=0;i<current.length;i++)visit(current[i],`${path}[]`,`${actual}[${i}]`)}
   else if(current&&typeof current==='object')for(const [key,child] of Object.entries(current))visit(child,path?`${path}.${key}`:key,`${actual}.${key}`)
  }
  visit(value,normalizedRoot,sourcePath)
 }
 const record=(value,file,path,bodyPath=`${path}.response`)=>{
  const r=value.response,kind=value.kind
  if(!r||typeof r!=='object')return
  if(kind==='check-detail'&&r.check){for(const shape of ['DetailedCheckAttributes','DetailedHttpAttributes','DetailedTcpAttributes','DetailedDnsAttributes','DetailedSmtpAttributes','DetailedHttpCustomAttributes','DetailedUdpAttributes','DetailedPop3Attributes','DetailedImapAttributes','Pingdom detail extension','Pingdom future schema'])note(shape,r.check,file,`${bodyPath}.check`)}
  if(kind==='probes'&&Array.isArray(r.probes))r.probes.forEach((v,i)=>note('Probe',v,file,`${bodyPath}.probes[${i}]`))
  if(kind==='contacts'&&Array.isArray(r.contacts))r.contacts.forEach((v,i)=>note('Contact',v,file,`${bodyPath}.contacts[${i}]`,'contact'))
  const pingdomShapes={'teams':'Teams','maintenance':'maintenance_resp_attrs','maintenance-occurrences':'maintenance.occurrences_resp_attrs','results':'results_resp_attrs','summary-outage':'summary.outage_resp_attrs','summary-average':'summary_resp_attrs','summary-performance':'summary.performance_resp_attrs','tms-detail':'CheckWithoutIDGET','tms-status-report':'ReportStatusSingle','tms-performance-report':'ReportPerformance','tms-list':'ChecksAll'}
  if(pingdomShapes[kind])note(pingdomShapes[kind],r,file,`${path}.response`)
  if(value.request?.query)note('Pingdom request option',value.request.query,file,`${path}.request.query`)
  if(kind==='canary-detail'&&r.Canary)note('Canary',r.Canary,file,`${path}.response.Canary`)
  if(kind==='canaries-list'&&Array.isArray(r.Canaries)){r.Canaries.forEach((v,i)=>note('Canary',v,file,`${path}.response.Canaries[${i}]`));note('DescribeCanariesResponse',r,file,`${path}.response`)}
  if(kind==='canary-code-input')note('CanaryCodeInput',r,file,`${path}.response`)
  if(kind==='canary-run-config-input')note('CanaryRunConfigInput',r,file,`${path}.response`)
  if(kind==='alarms-list'){for(const [key,shape] of [['MetricAlarms','MetricAlarm'],['CompositeAlarms','CompositeAlarm']])if(Array.isArray(r[key]))r[key].forEach((v,i)=>note(shape,v,file,`${path}.response.${key}[${i}]`));note('DescribeAlarmsOutput',r,file,`${path}.response`)}
 }
 for(const [file,bytes] of files){
  if(!file.endsWith('.json')||file.startsWith('reimport/')||file.includes('501-monitors')||file.includes('expanded-companion-bound')||file.includes('oversized'))continue
  let value;try{value=JSON.parse(bytes)}catch{continue}
  if(value?.format==='uptime.incumbent-capture.v1')value.records.forEach((r,i)=>record(r,file,`$.records[${i}]`))
  else if(value?.check)record({kind:'check-detail',response:value},file,'$','$')
  else if(value?.contacts)record({kind:'contacts',response:value},file,'$','$')
 }
 const entries=csvRows(csv).map((row,i)=>{
  let field=row.field,examples
  if(field.endsWith('{}')){const prefix=field.slice(0,-2);examples=[...index].filter(([key])=>key.startsWith(`${row.documented_shape}\0${prefix}.`)).flatMap(([,refs])=>refs).slice(0,3)}
  else if(field==='unknown JSON pointer')examples=index.get('Pingdom future schema\0syntheticExtension.nested.futureField')
  else examples=index.get(`${row.documented_shape}\0${field}`)
  return {inventoryRow:i+1,provider:row.provider,shape:row.documented_shape,field:row.field,plannerDisposition:row.current,plannerReason:row.reason,productPlace:row.product_place,examples:examples??[]}
 })
 const missing=entries.filter(value=>!value.examples.length)
 return {format:'uptime.documented-field-coverage.v1',author:'Codex',date:'2026-11-17',rows:entries.length,covered:entries.length-missing.length,missing:missing.map(v=>({shape:v.shape,field:v.field})),entries}
}

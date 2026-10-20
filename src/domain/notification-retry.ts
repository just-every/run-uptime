/** The receiver must deduplicate signed requests by webhook-id / stable event id.
 * Test sends and drills deliberately stay single-attempt, even on a signed receiver. */
export function deduplicatedNotification(credential:any,event:any){
 return event.kind!=='test'&&typeof credential.signing_secret==='string'&&credential.signing_secret.length>=32&&(credential.webhook?.signing??true);
}
export function notificationRetryPolicy(input:any){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['maxAttempts','windowMs'].includes(k))||!Number.isSafeInteger(input.maxAttempts)||input.maxAttempts<1||input.maxAttempts>10||!Number.isSafeInteger(input.windowMs)||input.windowMs<1000||input.windowMs>86400000)throw Error('Retry policy needs 1–10 attempts and a 1000–86400000 ms window');
 return {maxAttempts:input.maxAttempts as number,windowMs:input.windowMs as number};
}
/** Injected randomness is bounded before use; only the resulting time is stored.
 * Retry-After is a minimum, including when jitter would otherwise shorten it. */
export function notificationRetryTime(row:{attempts:number;max_attempts:number;created_at:number;window_ms:number},outcome:any,now:number,random:()=>number=Math.random){
 const retry=outcome.kind==='uncertain'||outcome.kind==='retryable'||outcome.status>=500&&outcome.status<=599||outcome.status===429;
 if(!retry||outcome.status>=400&&outcome.status<500&&outcome.status!==429)return {nextAt:null,exhausted:false};
 const end=row.created_at+row.window_ms;
 const sample=random();if(!Number.isFinite(sample)||sample<0||sample>1)throw Error('Invalid retry jitter source');
 const delay=Math.round(1000*2**(row.attempts-1)*(0.8+0.4*sample));
 const nextAt=now+Math.max(delay,outcome.retryAfterMs??0);
 if(nextAt>end||now>=end)return {nextAt:null,exhausted:true};
 return {nextAt:row.attempts<row.max_attempts?nextAt:null,exhausted:false};
}

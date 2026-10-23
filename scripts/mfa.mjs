#!/usr/bin/env node
// The native Base cookie and responses remain at the user's terminal. Secrets
// are accepted through environment/stdin, never command-line arguments or files.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
class MfaCommandError extends Error {}
export async function main(argv=process.argv.slice(2),env=process.env,fetcher=fetch,input={}){
 const [command,...args]=argv,flags={};
 for(let i=0;i<args.length;i+=2){if(!['--origin','--id','--required'].includes(args[i])||!args[i+1]||Object.hasOwn(flags,args[i]))throw new MfaCommandError('Use --origin, --id or --required with one value');flags[args[i]]=args[i+1]}
 let origin;try{const url=new URL(flags['--origin']);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw Error();origin=url.origin}catch{throw new MfaCommandError('Use the exact HTTPS app origin or local loopback origin')}
 const cookie=env.UPTIME_ACCESS_COOKIE;if(!cookie||/[\r\n]/.test(cookie))throw new MfaCommandError('UPTIME_ACCESS_COOKIE must hold a live Base session cookie');
 let method='POST',path,body={};
 if(command==='status'){method='GET';path='/status'}
 else if(command==='totp-enroll')path='/totp/enroll';
 else if(command==='totp-confirm'){path='/totp/confirm';body={challengeId:input.challengeId,code:env.UPTIME_MFA_CODE}}
 else if(command==='totp-verify'){path='/totp/verify';body={code:env.UPTIME_MFA_CODE}}
 else if(command==='passkey-enroll')path='/webauthn/enroll';
 else if(command==='passkey-options')path='/webauthn/options';
 else if(command==='passkey-confirm'||command==='passkey-verify'){path=command==='passkey-confirm'?'/webauthn/confirm':'/webauthn/verify';body={challengeId:input.challengeId,credential:input.credential}}
 else if(command==='recovery-use'){path='/recovery/verify';body={code:env.UPTIME_MFA_CODE}}
 else if(command==='recovery-rotate')path='/recovery/rotate';
 else if(command==='remove'){method='DELETE';path='/factors/'+encodeURIComponent(flags['--id']??'')}
 else if(command==='reset'){path='/reset';body={operatorId:flags['--id']}}
 else if(command==='require'){path='/policy';if(!['true','false'].includes(flags['--required']))throw new MfaCommandError('Use --required true or false');body={required:flags['--required']==='true'}}
 else throw new MfaCommandError('Use status, totp-enroll, totp-confirm, totp-verify, passkey-enroll, passkey-options, passkey-confirm, passkey-verify, recovery-use, recovery-rotate, remove, reset or require');
 const response=await fetcher(origin+'/api/access/mfa'+path,{method,redirect:'manual',headers:{origin,cookie,'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 if(!response.ok)throw new MfaCommandError(`Second-factor operation refused (HTTP ${response.status})`);
 return response.json();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  let input={};if(!process.stdin.isTTY){let bytes=0,text='';for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>65536)throw new MfaCommandError('Input is too large');text+=chunk}if(text.trim())input=JSON.parse(text)}
  // Enrollment/rotation explicitly display their material once. No file, mail,
  // telemetry, arbitrary refusal body or exception is copied to output.
  console.log(JSON.stringify(await main(process.argv.slice(2),process.env,fetch,input),null,2));
 }catch(error){console.error(error instanceof MfaCommandError?error.message:'Second-factor operation failed');process.exitCode=1}
}

import {proveMonitorStepUp} from '/workspace/run-uptime/tests/monitor-stepup-support.mjs';
console.log('Candidate monitor browser proof started.');
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
 const route=new URL(typeof input==='string'?input:input.url).pathname;
 console.log('HTTP_START',options?.method??'GET',route);
 const response=await nativeFetch(input,options);
 console.log('HTTP_RESULT',response.status,route);
 return response;
};
await proveMonitorStepUp();

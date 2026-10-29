import {resolvePublic} from './public-http.mjs';

// Attempt-local capture follows the original transport, including a mail
// transaction's receiving connection. It never resolves or connects on its own.
export function diagnosticCapture(){
 return {pin:undefined,phases:{dnsMs:null,connectMs:null,tlsMs:null,ttfbMs:null,totalMs:0}};
}
export async function resolveDiagnosticPin(capture,url,signal,options,privateAccess){
 if(capture){capture.pin=undefined;capture.phases={dnsMs:null,connectMs:null,tlsMs:null,ttfbMs:null,totalMs:0}}
 const started=Date.now();
 try{const pin=await(privateAccess?privateAccess(url,signal):resolvePublic(url,signal,options));if(capture)capture.pin=pin;return pin}
 finally{if(capture)capture.phases.dnsMs=Date.now()-started}
}
export async function measurePhase(capture,key,operation){
 const started=Date.now();try{return await operation()}finally{if(capture)capture.phases[key]=Date.now()-started}
}
export function socketPhases(capture,socket,secure=false){
 const started=Date.now();let connectedAt;
 const connected=()=>{connectedAt=Date.now();if(capture)capture.phases.connectMs=connectedAt-started};
 socket.once('connect',connected);
 return ()=>{socket.off('connect',connected);if(capture){if(connectedAt===undefined)capture.phases.connectMs=Date.now()-started;else if(secure)capture.phases.tlsMs=Date.now()-connectedAt}};
}

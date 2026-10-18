export type FlowOpaqueArtifact={format:'webm'|'zip';data:string}|{unavailable:string};
export interface FlowArtifacts {video:FlowOpaqueArtifact;trace:FlowOpaqueArtifact;waterfall:{url:string;method:string;status:number|null;startMs:number;durationMs:number}[];console:{type:'error'|'warning';text:string}[]}
export const FLOW_ARTIFACT_LIMITS:Readonly<{videoBytes:131072;traceBytes:65536;waterfall:60;console:20;textBytes:1024}>;
export function normalizeFlowArtifacts(value:unknown,options?:{secrets?:string[];allowEmail?:boolean}):FlowArtifacts;
export function discardFlowArtifacts(value:FlowArtifacts,reason?:string):FlowArtifacts;

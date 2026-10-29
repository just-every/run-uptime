export interface DiagnosticPhases {dnsMs:number|null;connectMs:number|null;tlsMs:number|null;ttfbMs:number|null;totalMs:number}
export interface NetworkDiagnostics {version:1;category:string;phases:DiagnosticPhases;route:{tool:string;reason:string|null;hops:{hop:number;address:string|null;lossPercent:number;rttMs:number|null}[]}}
export const NETWORK_DIAGNOSTIC_REASONS: readonly string[];
export const NETWORK_DIAGNOSTIC_LIMITS: Readonly<Record<string,number>>;
export function normalizeDiagnosticPhases(value:unknown):DiagnosticPhases;
export function normalizeNetworkDiagnostics(value:unknown):NetworkDiagnostics;

export const DIAGNOSTIC_PROTOCOLS: readonly string[];
export function protocolDiagnosticCategory(definition:any,observation:any):string|null;
export function validateProtocolDiagnosticSnapshot(snapshot:any,definition:any,observation:any):any;

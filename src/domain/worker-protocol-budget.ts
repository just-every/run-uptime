/** Outbound requests one attempt can use, for the scheduled run's budget. */
export function protocolRequests(def:any){
 return ['ping','udp'].includes(def.type)?0:def.type==='tcp'?3:def.type==='tls'?4:def.type==='dns'?def.dns.resolvers.length+(def.dns.resolvers.includes('authoritative')?6:0)+(def.dns.resolvers.includes('nameserver')?2:0):9
}

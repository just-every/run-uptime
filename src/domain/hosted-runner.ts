// Installation-local execution identity: no bearer credential is issued for the Worker.
export const HOSTED_RUNNER_ID='self-00000000-0000-4000-8000-000000000019'
export const hostedHttp=(definition:any)=>definition.network==='public'&&['http','keyword'].includes(definition.type??'http')&&!definition.request
export const hostedInstallation=(env:{UPTIME_LOCAL_REVIEW?:string})=>env.UPTIME_LOCAL_REVIEW!=='true'
// A hosted demo has no private runner beside it, so the Worker answers website checks itself (worker-discovery.server.ts).
export const workerDiscovery=(env:{UPTIME_LOCAL_REVIEW?:string;RER_DEMO?:string})=>env.RER_DEMO==='1'&&hostedInstallation(env)
export const SELF_CHECK_REFUSAL='This app cannot monitor itself from inside the Cloudflare Worker. Choose a private runner for this address.'
export const ownOrigin=(url:string,origin?:string)=>Boolean(origin&&new URL(url).origin===new URL(origin).origin)

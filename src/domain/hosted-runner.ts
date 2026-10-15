// Installation-local execution identity: no bearer credential is issued for the Worker.
export const HOSTED_RUNNER_ID='self-00000000-0000-4000-8000-000000000019'
export const hostedHttp=(definition:any)=>definition.network==='public'&&['http','keyword'].includes(definition.type??'http')&&!definition.request
export const hostedInstallation=(env:{UPTIME_LOCAL_REVIEW?:string;RER_DEMO?:string})=>env.UPTIME_LOCAL_REVIEW!=='true'&&env.RER_DEMO!=='1'

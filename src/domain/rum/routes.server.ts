// PERF-001: the owner API of the real-user beacon and the page-speed report. Mounted after the owner-session middleware and the
// input boundary (request-boundary.ts), like every private /api route.
import {operatorSession} from '../operator-auth.server.ts'
import {rumSites,registerRumSite,updateRumSite,rumReport,pageSpeedReport} from './sites.server.ts'

export function registerRumRoutes(api:any){
 const actor=async(c:any)=>({kind:'operator' as const,ref:(await operatorSession(c.env,c.req.raw))!.operator.id})
 api.get('/api/rum/sites',async(c:any)=>c.json(await rumSites(c.env)))
 api.post('/api/rum/sites',async(c:any)=>c.json(await registerRumSite(c.env,c.get('input'),await actor(c)),201))
 api.patch('/api/rum/sites/:id',async(c:any)=>c.json(await updateRumSite(c.env,c.req.param('id'),c.get('input'),await actor(c))))
 api.get('/api/rum/sites/:id/report',async(c:any)=>c.json(await rumReport(c.env,c.req.param('id'),Number(c.req.query('hours')??24))))
 api.get('/api/monitors/:id/pagespeed',async(c:any)=>c.json(await pageSpeedReport(c.env,c.req.param('id'))))
}

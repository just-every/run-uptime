import {historyPlan} from './preview.server.ts'
import {applyHistory,removeHistoryBatch} from './apply.server.ts'
import {setHistoryCutover} from './cutover.server.ts'
import {refuse} from './model.ts'
/** Mounted after the existing origin, owner-permission, size and schema boundaries. */
export function registerSourceHistory(api:any){
 api.post('/api/definitions/history/preview',async(c:any)=>{const input=c.get('input');if(typeof input?.text!=='string')refuse('History preview needs file text');return c.json(await historyPlan(c.env,input.text))})
 api.post('/api/definitions/history/apply',async(c:any)=>c.json(await applyHistory(c.env,c.get('input'))))
 api.get('/api/definitions/history/batches',async(c:any)=>c.json((await c.env.DB.prepare('SELECT * FROM source_history_batches ORDER BY imported_at,id,monitor_id').all()).results))
 api.delete('/api/definitions/history/batches/:id',async(c:any)=>c.json(await removeHistoryBatch(c.env,c.req.param('id'))))
 api.post('/api/definitions/history/cutover/:id',async(c:any)=>c.json(await setHistoryCutover(c.env,c.req.param('id'),c.get('input'))))
}

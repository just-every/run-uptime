// Contact belongs to the assigned location, independently of older target results.
export const CHECKER_FRESH_MS=120000
export function checkerReporting(runner:any,now:number,staleMs=CHECKER_FRESH_MS){
 return Boolean(runner&&runner.revokedAt===null&&(runner.hosted||runner.lastContactAt!==null&&Number.isFinite(runner.lastContactAt)&&runner.lastContactAt<=now&&now-runner.lastContactAt<=staleMs))
}
export function checkerStatus(definition:any,runners:any[],now:number,staleMs=CHECKER_FRESH_MS){
 const legacy=runners.find(r=>r.builtIn)
 const assigned=Object.values(definition.assignments??(legacy?{legacy:{runnerId:legacy.runnerId,networkLabel:legacy.networkLabel}}:{})) as any[]
 const missing=assigned.filter(a=>!checkerReporting(runners.find(r=>r.runnerId===a.runnerId),now,staleMs)).map(a=>{
  const runner=runners.find(r=>r.runnerId===a.runnerId)
  return {name:runner?.networkLabel??a.networkLabel,thisComputer:Boolean(runner?.builtIn&&!runner?.hosted),lastContactAt:runner?.lastContactAt??null}
 })
 return {missing,reporting:assigned.length-missing.length}
}

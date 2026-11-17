import {epoch,day,get,copy} from './transport.mjs'

export function addHistory(c){
 const from=epoch-60*day,to=epoch,checkId=61000
 const times=Array.from({length:1205},(_,i)=>from+Math.floor(i*(to-from)/1205))
 const outages=[{from:times[100],durationSeconds:61},{from:times[500],durationSeconds:733},{from:times[1000],durationSeconds:3671}].map(value=>({...value,to:value.from+value.durationSeconds}))
 const unknown={from:from+9*day+300,to:from+9*day+2100}
 const downAt=time=>outages.some(value=>time>=value.from&&time<value.to)
 const results=times.map((time,i)=>({probeid:i%2?85002:85001,time,status:downAt(time)?'down':time>=unknown.from&&time<unknown.to?'unknown':'up',responsetime:downAt(time)?0:100+i%67,statusdesc:downAt(time)?'Connection refused':'OK',statusdesclong:downAt(time)?'Synthetic outage: receiver unavailable':'Synthetic response accepted'}))
 for(let offset=0;offset<results.length;offset+=200){
  const page=results.slice(offset,offset+200)
  c.add(`history/results-${String(offset).padStart(4,'0')}.json`,'results',{results:page,activeprobes:[85001,85002]},{sourceId:checkId,recordCount:page.length,request:get(`/api/3.1/results/${checkId}`,{from,to,limit:200,offset}),pagination:{offset,limit:200,...(offset+200<results.length?{nextOffset:offset+200}:{})}})
 }
 const events=[...outages.map(value=>({...value,status:'down'})),{...unknown,status:'unknown'}].sort((a,b)=>a.from-b.from),states=[]
 let cursor=from
 for(const event of events){if(cursor<event.from)states.push({status:'up',timefrom:cursor,timeto:event.from});states.push({status:event.status,timefrom:event.from,timeto:event.to});cursor=event.to}
 if(cursor<to)states.push({status:'up',timefrom:cursor,timeto:to})
 c.add('history/outages.json','summary-outage',{summary:{states}},{sourceId:checkId,recordCount:states.length,request:get(`/api/3.1/summary.outage/${checkId}`,{from,to})})
 const totaldown=outages.reduce((sum,value)=>sum+value.durationSeconds,0),totalunknown=unknown.to-unknown.from,totalup=to-from-totaldown-totalunknown
 c.add('history/average.json','summary-average',{summary:{responsetime:{from,to,avgresponse:133},status:{totalup,totaldown,totalunknown}}},{sourceId:checkId,request:get(`/api/3.1/summary.average/${checkId}`,{from,to,includeuptime:true})})
 c.add('history/average-grouped.json','summary-average',{summary:{responsetime:{from,to,avgresponse:[{countryiso:'US',probeid:85001,avgresponse:132},{countryiso:'DE',probeid:85002,avgresponse:134}]}}},{sourceId:checkId,recordCount:2,request:get(`/api/3.1/summary.average/${checkId}`,{from,to,byprobe:true})})
 const overlap=(start,end,event)=>Math.max(0,Math.min(end,event.to)-Math.max(start,event.from))
 const aggregate=(start,length)=>{const downtime=outages.reduce((sum,event)=>sum+overlap(start,start+length,event),0),unmonitored=overlap(start,start+length,unknown);return {starttime:start,avgresponse:133,uptime:length-downtime-unmonitored,downtime,unmonitored}}
 const days=Array.from({length:60},(_,i)=>aggregate(from+i*day,day))
 c.add('history/performance-days.json','summary-performance',{summary:{days}},{sourceId:checkId,recordCount:60,request:get(`/api/3.1/summary.performance/${checkId}`,{from,to,resolution:'day',includeuptime:true,order:'asc'})})
 // Deliberately overlapping native aggregates. They are alternatives, never an
 // additive denominator alongside the daily summary or raw result sample set.
 c.add('history/performance-weeks-overlap.json','summary-performance',{summary:{weeks:[aggregate(from,7*day),aggregate(from+7*day,7*day)]}},{sourceId:checkId,recordCount:2,request:get(`/api/3.1/summary.performance/${checkId}`,{from,to:from+14*day,resolution:'week',includeuptime:true,order:'asc'})})
 c.add('history/performance-hours-overlap.json','summary-performance',{summary:{hours:[aggregate(from,3600),aggregate(from+3600,3600)]}},{sourceId:checkId,recordCount:2,request:get(`/api/3.1/summary.performance/${checkId}`,{from,to:from+7200,resolution:'hour',includeuptime:true,order:'asc'})})
 const unmapped={results:[{...copy(results[0]),statusdesc:'Unmapped synthetic monitor'}],activeprobes:[85001]}
 c.add('history/unmapped-monitor.json','results',unmapped,{sourceId:69999,request:get('/api/3.1/results/69999',{from,to,limit:200,offset:0}),pagination:{offset:0,limit:200}})
 return {from,to,outages,unknown,results,states,days,counts:{historyDays:60,outages:3,outageSeconds:totaldown,resultSamples:1205,resultPages:7,unmappedHistoryRows:1,dailyAggregates:60},expected:{sourceCheckId:String(checkId),unmappedCheckId:'69999',from,to,outages,totalup,totaldown,totalunknown,resultSamples:1205,reportWindow:{from,to:to+30*day,cutover:to,days:90},aggregationRule:'Do not sum overlapping daily/weekly/hourly or raw/aggregate denominators.'}}
}

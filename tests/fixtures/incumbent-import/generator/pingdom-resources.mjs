import {get,epoch,seconds,copy} from './transport.mjs'
export {addHistory} from './pingdom-history.mjs'
export {addTransactions} from './pingdom-transactions.mjs'

export function addRelationships(c,teams){
 c.add('teams.json','teams',{teams},{recordCount:2,request:get('/api/3.1/alerting/teams')})
 const contacts=[
  {id:71001,name:'Synthetic Owner',type:'user',owner:true,paused:false,notification_targets:{email:[{severity:'HIGH',address:'owner@example.test'}],sms:[{severity:'HIGH',country_code:'1',number:'2025550101',provider:'synthetic'}]},teams:[{id:81001,name:'Synthetic Platform'}]},
  {id:71002,name:'Synthetic Notify',type:'contact',owner:false,paused:false,notification_targets:{email:[{severity:'HIGH',address:'notify@example.test'}]},teams:[{id:81001,name:'Synthetic Platform'}]},
  {id:71003,name:'Synthetic SMS',type:'contact',owner:false,paused:true,notification_targets:[{severity:'HIGH',country_code:'1',number:'2025550102',provider:'synthetic'}],teams:[{id:81002,name:'Synthetic Réponse'}]},
  {id:71004,name:'Synthetic APNS',type:'user',owner:false,paused:false,notification_targets:[{severity:'HIGH',device_name:'Synthetic iPhone',apns_device:'SYNTHETIC_APNS_AUTHORITY_DO_NOT_IMPORT'}],teams:[{id:81002,name:'Synthetic Réponse'}]},
  {id:71005,name:'Synthetic AGCM',type:'contact',owner:false,paused:false,notification_targets:[{severity:'LOW',agcm_id:'SYNTHETIC_AGCM_AUTHORITY_DO_NOT_IMPORT'}],teams:[]}
 ]
 c.add('contacts.json','contacts',{contacts},{recordCount:5,request:get('/api/3.1/alerting/contacts')})
 const maintenance=[
  {id:82001,description:'Synthetic one-time maintenance — café',from:seconds('2026-10-30T02:00:00Z'),to:seconds('2026-10-30T02:30:00Z'),recurrencetype:'none',repeatevery:0,effectiveto:seconds('2026-10-30T02:30:00Z'),checks:{uptime:[61000],tms:[83001]}},
  {id:82002,description:'Synthetic recurring epoch window',from:seconds('2026-10-31T05:30:00Z'),to:seconds('2026-10-31T06:00:00Z'),recurrencetype:'day',repeatevery:1,effectiveto:seconds('2026-11-03T06:00:00Z'),checks:{uptime:[61001,61025],tms:[83002,83003]}}
 ]
 c.add('maintenance.json','maintenance',{maintenance},{recordCount:2,request:get('/api/3.1/maintenance',{limit:25,offset:0}),pagination:{limit:25,offset:0}})
 const occurrences=[{id:84001,maintenanceid:82001,from:maintenance[0].from,to:maintenance[0].to},...[0,1,2,3].map(i=>({id:84002+i,maintenanceid:82002,from:maintenance[1].from+i*86400,to:maintenance[1].to+i*86400}))]
 c.add('maintenance-occurrences.json','maintenance-occurrences',{occurrences},{recordCount:5,request:get('/api/3.1/maintenance.occurrences',{from:epoch-2*86400,to:epoch+3*86400})})
 c.add('probes.json','probes',{probes:[
  {id:85001,country:'United States',city:'Synthetic East',name:'Synthetic East',active:true,hostname:'probe-east.example.test',ip:'192.0.2.11',ipv6:'2001:db8::11',countryiso:'US'},
  {id:85002,country:'Germany',city:'Synthetic Europe',name:'Synthetic Europe',active:true,hostname:'probe-eu.example.test',ip:'198.51.100.12',ipv6:'2001:db8::12',countryiso:'DE'},
  {id:85003,country:'Australia',city:'Synthetic APAC',name:'Synthetic APAC',active:false,hostname:'probe-apac.example.test',ip:'203.0.113.13',ipv6:'2001:db8::13',countryiso:'AU'}
 ]},{recordCount:3,request:get('/api/3.1/probes',{limit:25,offset:0,includedeleted:true}),pagination:{limit:25,offset:0}})
 // Explicit schema alternative using the same identities; never additional contacts.
 const schemaAlternative=copy(contacts)
 schemaAlternative[0].notification_targets=[...contacts[0].notification_targets.email,...contacts[0].notification_targets.sms]
 schemaAlternative[1].notification_targets=[...contacts[1].notification_targets.email]
 c.put('variants/contacts-schema-array.json',{contacts:schemaAlternative})
}

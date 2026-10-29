// Saved source documents, with inert source authority and alert state that must never become local authority or alerts.
export const heartbeatImports=[
 {source:'uptimerobot',name:'synthetic-uptime-601',sourceToken:'synthetic-uptime-611',document:{data:[{id:601,friendlyName:'synthetic-uptime-601',type:'HEARTBEAT',interval:3600,gracePeriod:300,heartbeatUrl:'https://source.example.test/synthetic-uptime-611',status:'DOWN',assignedAlertContacts:[{id:621}],alertDelay:120,alertRepeat:600}],nextLink:null}},
 {source:'betterstack-heartbeats',name:'synthetic-uptime-602',sourceToken:'synthetic-uptime-612',document:{data:[{id:'602',type:'heartbeat',attributes:{name:'synthetic-uptime-602',period:3600,grace:300,url:'https://source.example.test/synthetic-uptime-612',status:'down',policy_id:'synthetic-uptime-622'}}]}},
];
export const importedHeartbeatSettings={maxAgeMs:3600000,graceMs:300000,maxRunDurationMs:0,outputMasks:[]};

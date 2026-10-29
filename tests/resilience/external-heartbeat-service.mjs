// Independent network-edge service: its own timer and retained journal survive
// the disappearance of every Uptime Worker. No application code runs here.
import http from 'node:http';
import {appendFileSync} from 'node:fs';

const [journal,path,deadlineText]=process.argv.slice(2),deadlineMs=Number(deadlineText);
let sequence=0,lastPing,alarm,timer;
function retain(kind,details={}){
 const event={sequence:++sequence,kind,at:Date.now(),pid:process.pid,...details};
 appendFileSync(journal,JSON.stringify(event)+'\n',{mode:0o600});
 return event;
}
function arm(){
 clearTimeout(timer);
 timer=setTimeout(()=>{
  if(Date.now()<lastPing.deadline){arm();return}
  alarm=retain('alarm',{ping:lastPing.sequence,deadline:lastPing.deadline,reason:'heartbeat overdue'});
 },Math.max(1,lastPing.deadline-Date.now()));
}
const server=http.createServer((request,response)=>{
 if(request.method!=='GET'||request.url!==path){response.writeHead(403).end();return}
 lastPing=retain('ping',{path,method:request.method,deadline:Date.now()+deadlineMs});
 if(alarm){retain('recovery',{alarm:alarm.sequence,ping:lastPing.sequence});alarm=undefined}
 arm();
 response.writeHead(204).end();
});
server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port,pid:process.pid}));
process.on('SIGTERM',()=>{clearTimeout(timer);server.closeAllConnections();server.close(()=>process.exit(0))});

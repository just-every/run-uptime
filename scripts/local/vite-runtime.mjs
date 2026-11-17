import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';

// Cloudflare starts auxiliary listeners before Vite. Announce only Vite's
// bound application socket so the parent never mistakes one of them for it.
// Contact establishes authenticated operation; the launcher's private process
// record also catches a crash immediately when rer dev checks an existing app.
const checkerHealth={name:'uptime-checker-health',enforce:'pre',configureServer(server){
 server.middlewares.use(async(request,response,next)=>{
  const url=new URL(request.url,'http://localhost');
  if(url.pathname!=='/health'||url.searchParams.get('app')==='1'||!process.env.UPTIME_CHECKER_PROCESS_FILE)return next();
  try{const {pid}=JSON.parse(await readFile(process.env.UPTIME_CHECKER_PROCESS_FILE,'utf8'));if(!Number.isSafeInteger(pid)||pid<=0)throw Error();process.kill(pid,0)}
  catch{response.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify({status:'checker_stopped',error:'This computer’s checker stopped. In Uptime’s folder, run rer dev --stop, then rer dev.'}));return}
  next();
 });
}};
const server=await createServer({plugins:[checkerHealth],server:{host:'127.0.0.1',port:0,strictPort:true}});
let stopping;
const stop=()=>stopping??=server.close().finally(()=>{if(process.connected)process.disconnect()});
process.on('SIGINT',()=>void stop());
process.on('SIGTERM',()=>void stop());
try{
 await server.listen();
 const address=server.httpServer?.address();
 if(!address||typeof address==='string')throw Error('Vite did not bind an application socket');
 process.send?.({type:'rer-listening',requestedPort:0,port:address.port});
 server.printUrls();
}catch(error){await stop();throw error}

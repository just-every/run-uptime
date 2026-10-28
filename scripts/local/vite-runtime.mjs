import {createServer} from 'vite';

// Cloudflare starts auxiliary listeners before Vite. Announce only Vite's
// bound application socket so the parent never mistakes one of them for it.
const server=await createServer({server:{host:'127.0.0.1',port:0,strictPort:true}});
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

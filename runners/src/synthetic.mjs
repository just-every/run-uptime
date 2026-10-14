import {startSynthetic} from './synthetic-server.mjs';
const target=await startSynthetic();
console.log(`Local synthetic endpoint http://127.0.0.1:${target.port}`);
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{await target.close();process.exit(0)});

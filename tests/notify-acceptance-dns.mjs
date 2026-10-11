import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
// An isolated process substitutes DNS and counts sockets at the built-in
// boundary. The actual production pinned transport must refuse before connect.
let sockets=0;
https.request=()=>{sockets++;throw Error('Unsafe DNS reached a socket')};
syncBuiltinESMExports();
const {NodePinnedTransport}=await import('../src/base/modules/integrations/core/node-transport.ts');
for(const answers of [[],[{address:'127.0.0.1',family:4}],[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}],[{address:'2606:4700:4700::1111',family:6},{address:'fe80::1',family:6}],[{address:'169.254.169.254',family:4}]]){
 dns.lookup=async()=>answers;syncBuiltinESMExports();
 await assert.rejects(new NodePinnedTransport().send({url:'https://notifications.example.com/incident',headers:{},body:'{}'}),/Destination DNS is not public/);
}
assert.equal(sockets,0,'unsafe and mixed DNS never connect');
console.log('PASS actual Node pinned transport rejects empty private link-local metadata and mixed public/private DNS before any socket');

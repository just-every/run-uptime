// UDP-001 network edge only: keep production DNS validation and numeric pinning,
// then route the pinned public socket to this test's loopback UDP receiver.
import './protocol-routing.mjs';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import {Resolver} from 'node:dns/promises';
const resolve4=Resolver.prototype.resolve4;
Resolver.prototype.resolve4=async function(host){
 if(host==='udp.protocol.test')return process.env.UDP_PRIVATE_DNS==='1'?['10.0.0.1']:['93.184.216.34'];
 return resolve4.call(this,host);
};
const connect=dgram.Socket.prototype.connect;
dgram.Socket.prototype.connect=function(port,address,...rest){
 assert.equal(address,'93.184.216.34');assert.equal(port,9000);
 return connect.call(this,Number(process.env.UDP_TARGET_PORT),'127.0.0.1',...rest);
};

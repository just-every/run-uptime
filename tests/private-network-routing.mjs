// PRIVATE-001 network edge: validate and pin the private address normally, then
// route its socket to the authorized loopback service used by this test.
import './protocol-routing.mjs';
import {Resolver} from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
const original=Resolver.prototype.resolve4;
Resolver.prototype.resolve4=async function(host){
 if(host==='checkout.internal.test')return process.env.PRIVATE_DNS_MODE==='mixed'?['10.24.3.10','10.24.3.11']:process.env.PRIVATE_DNS_MODE==='metadata'?['169.254.169.254']:['10.24.3.10'];
 if(host==='neighbor.internal.test')return ['10.24.3.11'];
 return original.call(this,host);
};
const request=http.request;
http.request=function(options,...rest){
 if(typeof options==='object'&&(['10.24.3.10','10.24.3.11','169.254.169.254'].includes(options.host)||['10.24.3.10','10.24.3.11','169.254.169.254'].includes(options.hostname)))return request.call(this,{...options,host:'127.0.0.1',hostname:'127.0.0.1',port:Number(process.env.PRIVATE_HTTP_PORT)},...rest);
 return request.call(this,options,...rest);
};
const connect=net.connect;
net.connect=function(options,...rest){
 if(typeof options==='object'&&['10.24.3.10','10.24.3.11','169.254.169.254'].includes(options.host))return connect.call(this,{...options,host:'127.0.0.1',port:Number(process.env.PRIVATE_TCP_PORT)},...rest);
 return connect.call(this,options,...rest);
};

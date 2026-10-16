// Cloudflare's published address ranges (https://www.cloudflare.com/ips/, read 17 October 2026) plus its public resolver
// prefixes. A Worker socket cannot connect to these addresses, and the Worker's socket proxy reports that exactly as it
// reports a refused port, so the Worker checks the target's addresses first and says plainly that it cannot check them.
const V4=['173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22','141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20','197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13','104.24.0.0/14','172.64.0.0/13','131.0.72.0/22','1.1.1.0/24','1.0.0.0/24'];
const V6=['2400:cb00::/32','2606:4700::/32','2803:f800::/32','2405:b500::/32','2405:8100::/32','2a06:98c0::/29','2c0f:f248::/32'];
const v4=address=>address.split('.').reduce((n,part)=>n*256+Number(part),0);
function v6(address){
 const [head,tail=' ']=address.toLowerCase().split('::'),left=head?head.split(':'):[],right=tail.trim()?tail.split(':'):[];
 const groups=[...left,...Array(8-left.length-right.length).fill('0'),...right];
 return groups.reduce((n,g)=>n*65536n+BigInt(parseInt(g||'0',16)),0n);
}
function inRange(address,range){
 const [base,bits]=range.split('/'),size=Number(bits);
 if(address.includes(':')!==base.includes(':'))return false;
 if(!address.includes(':')){const mask=size===0?0:(~0<<(32-size))>>>0;return ((v4(address)&mask)>>>0)===((v4(base)&mask)>>>0)}
 const shift=BigInt(128-size);return (v6(address)>>shift)===(v6(base)>>shift);
}
export const cloudflareAddress=address=>(address.includes(':')?V6:V4).some(range=>inRange(address,range));

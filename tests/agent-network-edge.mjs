// Test-only network boundary. Production scheduling, scope, DNS validation,
// immutable attempts, incident policy and D1 remain in the application.
export default {async fetch(request){
 const url=new URL(request.url);
 if(url.origin==='https://probe.uptime.example.test'&&request.method==='GET')return new Response('Checkout available',{status:200});
 if(url.origin==='https://cloudflare-dns.com'&&request.method==='GET')return Response.json({Status:0,Answer:[{name:url.searchParams.get('name'),type:url.searchParams.get('type')==='AAAA'?28:1,TTL:60,data:url.searchParams.get('type')==='AAAA'?'2606:4700::1111':'1.1.1.1'}]});
 return new Response('Undeclared operation',{status:502});
}};

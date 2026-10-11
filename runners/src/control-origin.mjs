export function controlOrigin(value,{localReview=false}={}){
 let url;try{url=new URL(value)}catch{throw Error('Invalid control-plane origin')}
 if(url.origin!==value||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Exact control-plane origin required');
 const local=localReview===true&&url.protocol==='http:'&&url.hostname==='127.0.0.1'&&Number(url.port)>0&&Number(url.port)<=65535;
 if(!local&&url.protocol!=='https:')throw Error('HTTPS control-plane origin required');
 return url;
}

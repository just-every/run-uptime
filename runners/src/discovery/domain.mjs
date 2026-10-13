import {isIP} from 'node:net';
// Registrable domain without a public-suffix list: the last two labels, or three when the pair is a common two-part
// suffix (co.uk, com.au) or a shared hosting suffix where each customer owns a label (vercel.app, github.io).
const TWO_PART=new Set(['co.uk','org.uk','ac.uk','gov.uk','me.uk','ltd.uk','plc.uk','com.au','net.au','org.au','edu.au','gov.au','co.nz','net.nz','org.nz','govt.nz','co.jp','ne.jp','or.jp','ac.jp','com.br','net.br','org.br','com.cn','net.cn','org.cn','com.mx','com.ar','com.tr','com.hk','com.sg','com.my','com.tw','co.kr','or.kr','co.in','net.in','org.in','co.za','org.za','co.il','co.id','com.ua','com.pl','com.es','com.pt','com.ph','com.vn','com.co']);
const SHARED=new Set(['github.io','gitlab.io','vercel.app','netlify.app','pages.dev','workers.dev','herokuapp.com','web.app','firebaseapp.com','onrender.com','fly.dev','azurewebsites.net','cloudfront.net','appspot.com','repl.co','glitch.me','statuspage.io','readthedocs.io','surge.sh']);
export const bareHost=host=>host.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
export function registrableDomain(host){
  host=bareHost(host);
  if(isIP(host)||!host.includes('.'))return host;
  const labels=host.split('.');
  if(labels.length<=2)return host;
  const lastTwo=labels.slice(-2).join('.');
  return labels.slice(TWO_PART.has(lastTwo)||SHARED.has(lastTwo)?-3:-2).join('.');
}
export const inDomain=(host,domain)=>{host=bareHost(host);return host===domain||host.endsWith('.'+domain)};
export const isStatusHost=host=>bareHost(host).startsWith('status.');
export const isApiHost=host=>/^api[.\-0-9]/.test(bareHost(host));

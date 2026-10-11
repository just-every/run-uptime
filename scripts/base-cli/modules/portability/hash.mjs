export const utf8 = value => new TextEncoder().encode(value);
export const canonicalJson = value => {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== 'object') {
    if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('invalid_json');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
};
export async function sha256(value) {
  const bytes = typeof value === 'string' ? utf8(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function base64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
export function unbase64(value) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('invalid_base64');
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

// Incremental SHA-256 for semantic JSON and objects. SubtleCrypto has no streaming
// digest API; part digests use Web Crypto, while this keeps memory independent of
// the number of rows. FIPS 180-4 compression, checked against SubtleCrypto in tests.
const K = Uint32Array.from([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);
const rotate = (x,n) => (x >>> n) | (x << (32-n));
export class StreamHash {
  constructor() {
    this.h = Uint32Array.from([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    this.block = new Uint8Array(64); this.used = 0; this.size = 0;
  }
  update(input) {
    const bytes = typeof input === 'string' ? utf8(input) : input;
    this.size += bytes.length;
    let offset = 0;
    while (offset < bytes.length) {
      const n = Math.min(64-this.used, bytes.length-offset);
      this.block.set(bytes.subarray(offset,offset+n),this.used); this.used += n; offset += n;
      if (this.used === 64) { this.compress(); this.used = 0; }
    }
    return this;
  }
  compress() {
    const w = new Uint32Array(64), view = new DataView(this.block.buffer);
    for (let i=0;i<16;i++) w[i] = view.getUint32(i*4);
    for (let i=16;i<64;i++) {
      const a=w[i-15], b=w[i-2];
      w[i]=w[i-16]+(rotate(a,7)^rotate(a,18)^(a>>>3))+w[i-7]+(rotate(b,17)^rotate(b,19)^(b>>>10));
    }
    let [a,b,c,d,e,f,g,h]=this.h;
    for (let i=0;i<64;i++) {
      const t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0;
      const t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    [a,b,c,d,e,f,g,h].forEach((v,i)=>{this.h[i]=(this.h[i]+v)>>>0;});
  }
  digest() {
    const size=this.size;
    this.update(Uint8Array.of(128));
    while(this.used!==56) this.update(Uint8Array.of(0));
    const tail=new Uint8Array(8),view=new DataView(tail.buffer);
    view.setUint32(0,Math.floor(size/0x20000000)); view.setUint32(4,(size*8)>>>0);
    this.update(tail);
    return [...this.h].map(x=>x.toString(16).padStart(8,'0')).join('');
  }
}

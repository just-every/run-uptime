// PNG-only, fixed-size generated artifacts. No ancillary metadata or trailing payload.
export const FAILURE_PAGE_BYTES=65536;
const unavailable=new Set(['capture_limit','capture_timeout','capture_aborted','capture_invalid','browser_unavailable','capture_failed','cancelled','policy_changed','custody_unavailable']);
export function normalizeFailurePage(value){
 const fail=()=>{throw Error('Invalid failure page screenshot')};
 if(!value||typeof value!=='object'||Array.isArray(value))fail();
 if(Object.keys(value).join(',')==='unavailable'&&unavailable.has(value.unavailable))return {unavailable:value.unavailable};
 if(Object.keys(value).sort().join(',')!=='data,format,height,width'||value.format!=='png'||value.width!==1000||value.height!==700||typeof value.data!=='string'||value.data.length>Math.ceil(FAILURE_PAGE_BYTES/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(value.data))fail();
 let raw;try{raw=atob(value.data);if(btoa(raw)!==value.data)fail()}catch{fail()}
 const data=Uint8Array.from(raw,c=>c.charCodeAt(0)),view=new DataView(data.buffer);
 if(data.length>FAILURE_PAGE_BYTES||data.length<57||[137,80,78,71,13,10,26,10].some((byte,i)=>data[i]!==byte))fail();
 let offset=8,header=false,image=false,ended=false;
 while(offset+12<=data.length){const size=view.getUint32(offset),type=String.fromCharCode(...data.subarray(offset+4,offset+8));if(size>FAILURE_PAGE_BYTES||offset+size+12>data.length)fail();
  if(type==='IHDR'){if(header||offset!==8||size!==13||view.getUint32(offset+8)!==1000||view.getUint32(offset+12)!==700||data[offset+16]!==8||![2,6].includes(data[offset+17])||data[offset+18]||data[offset+19]||data[offset+20])fail();header=true}
  else if(type==='IDAT'){if(!header||ended)fail();image=true}
  else if(type==='IEND'){if(!image||size!==0||offset+12!==data.length)fail();ended=true}
  else fail();
  offset+=size+12;
 }
 if(offset!==data.length||!ended)fail();return {format:'png',width:1000,height:700,data:value.data};
}

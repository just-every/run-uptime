// Browser artifacts are built from masked step frames. Raw video, DOM,
// request/response payloads and Playwright resources never leave this process.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {plainUrl} from '../../../src/domain/flow.mjs';
import {redactSnapshotText} from '../../../src/domain/failure-snapshot.mjs';
import {credentialRedactor} from './secrets.mjs';
import {sanitizedTrace} from './artifact-trace.mjs';
const require=createRequire(import.meta.resolve('playwright'));
const {PNG,jpegjs}=require('playwright-core/lib/utilsBundle'),{registry:{registry}}=require('playwright-core/lib/coreBundle');
const unavailable=()=>({unavailable:'capture_failed'});
const style='iframe,img,svg,canvas,video,object,embed { visibility:hidden !important } * { background-image:none !important; list-style-image:none !important; text-shadow:none !important } *::before,*::after { content:none !important }';
async function replay(frames,base){
 const output=join(base,'redacted.webm'),ffmpeg=registry.findExecutable('ffmpeg').executablePathOrDie('javascript');
 const child=spawn(ffmpeg,['-y','-loglevel','error','-f','image2pipe','-framerate','1','-c:v','mjpeg','-i','pipe:0','-an','-c:v','libvpx-vp9','-threads','1','-deadline','realtime','-cpu-used','8','-pix_fmt','yuv420p','-b:v','100k','-f','webm',output],{stdio:['pipe','ignore','ignore']});
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Replay encoder failed')))});
 const timer=setTimeout(()=>child.kill('SIGKILL'),4000);child.stdin.on('error',()=>{});
 try{for(const frame of frames)child.stdin.write(jpegjs.encode(PNG.sync.read(frame),65).data);child.stdin.end();await done;const data=await readFile(output);if(data.length>131072)throw Error('Replay capture limit');return {format:'webm',data:data.toString('base64')}}finally{clearTimeout(timer)}
}
export async function flowArtifacts({context,page,credentials,policy,base}){
 const known=Object.values(credentials).map(c=>c.value),credential=credentialRedactor(credentials);
 const redact=value=>redactSnapshotText(credential(String(value).replace(/https?:\/\/[^\s"'<>]+/g,url=>plainUrl(url)),10000),{requestSecrets:known,masks:policy?.masks??[]}).slice(0,250);
 const frames=[],waterfall=[],consoleErrors=[],pending=new Map();let traceStarted=false,latestFrameFailed=false;
 const started=Date.now(),enabled=Boolean(policy?.screenshot);
 if(enabled){try{await context.tracing.start({screenshots:false,snapshots:false,sources:false});traceStarted=true}catch{}}
 page.on('console',message=>{if(enabled&&['error','warning'].includes(message.type())&&consoleErrors.length<20)consoleErrors.push({type:message.type(),text:redact(message.text())})});
 page.on('pageerror',error=>{if(enabled&&consoleErrors.length<20)consoleErrors.push({type:'error',text:redact(error.message)})});
 page.on('request',request=>{if(enabled&&pending.size+waterfall.length<60)pending.set(request,{url:redact(plainUrl(request.url())),method:request.method(),status:null,startMs:Date.now()-started,durationMs:0})});
 page.on('response',response=>{const item=pending.get(response.request());if(item)item.status=response.status()});
 const end=request=>{const item=pending.get(request);if(item){item.durationMs=Math.max(0,Date.now()-started-item.startMs);waterfall.push(item);pending.delete(request)}};
 page.on('requestfinished',end);page.on('requestfailed',end);
 return {
  async frame(){if(!enabled||frames.length>=28)return;
   try{
    // Mark only for the synchronous capture window. All input values and media
    // are masked regardless of owner policy; known secrets and personal text
    // also mask their containing element, including split text nodes.
    const texts=await page.locator('body *').evaluateAll(nodes=>nodes.filter(node=>[...node.childNodes].some(child=>child.nodeType===3)).map(node=>node.textContent??''));
    const sensitive=texts.filter(text=>redact(text)!==text);
    if(sensitive.length>100)throw Error('Too many masked regions');
    const masks=[page.locator('input,textarea,select,[contenteditable],iframe,img,svg,canvas,video,object,embed')];
    for(const text of sensitive)masks.push(page.getByText(text,{exact:true}));
    const size=page.viewportSize(),buffer=await page.screenshot({type:'png',timeout:1500,animations:'disabled',mask:masks,maskColor:'#222222',style,clip:{x:0,y:0,width:Math.min(1000,size.width),height:Math.min(700,size.height)}});
    const raw=PNG.sync.read(buffer),padded=new PNG({width:1000,height:700});padded.data.fill(255);PNG.bitblt(raw,padded,0,0,raw.width,raw.height,0,0);const png=PNG.sync.write(padded);
    if(png.length>65536)throw Error('Screenshot capture limit');frames.push(png);latestFrameFailed=false;
   }catch{latestFrameFailed=true}
  },
  async finish(failed){
   let trace=unavailable(),video=unavailable();
   if(traceStarted){const path=join(base,'private-trace.zip');try{await context.tracing.stop({path});if(failed)trace=await sanitizedTrace(path,redact)}catch{}}
   if(!failed)return undefined;
   if(!enabled){const disabled={unavailable:'policy_disabled'};return {screenshot:disabled,artifacts:{video:disabled,trace:disabled,waterfall:[],console:[]}}}
   if(frames.length)try{video=await replay(frames,base)}catch{}
   for(const request of pending.keys())end(request);
   return {screenshot:frames.length&&!latestFrameFailed?{format:'png',width:1000,height:700,data:frames.at(-1).toString('base64')}:unavailable(),artifacts:{video,trace,waterfall,console:consoleErrors}};
  },
  redact
 };
}

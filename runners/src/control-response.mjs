// Own the reader through cancellation as well as receipt. Fetch may finish its
// socket before a JSON read finishes; cancelling a locked body requires its reader.
export async function readControlResponse(response,signal){
 if(!response.body){signal.throwIfAborted();return response.json()}
 const reader=response.body.getReader(),decoder=new TextDecoder();let text='',cancelling;
 const abort=()=>{cancelling??=reader.cancel(signal.reason).catch(()=>{})};
 signal.addEventListener('abort',abort,{once:true});
 try{
  if(signal.aborted)abort();
  signal.throwIfAborted();
  while(true){
   const {done,value}=await reader.read();
   signal.throwIfAborted();
   if(done)break;
   text+=decoder.decode(value,{stream:true});
  }
  return JSON.parse(text+decoder.decode());
 }finally{
  signal.removeEventListener('abort',abort);
  await cancelling;
  reader.releaseLock();
 }
}

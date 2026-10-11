// Shared by the real console and focused native/async regression tests.
// User action outcomes, read freshness and background announcements are distinct.
export function createActionFeedback({load,render,publish,lock=()=>{}}) {
  let busy=false,version=0,current=null,pendingRead=null,recoverableReadFailure=false;
  const feedback={action:{state:'idle',message:''},read:{state:'idle',message:''},background:{message:''}};
  const emit=()=>publish({busy,action:{...feedback.action},read:{...feedback.read},background:{...feedback.background}});
  async function refresh({duringAction=false,supersede=false}={}) {
    if(busy&&!duringAction||pendingRead&&!duringAction&&!supersede)return false;
    const ticket=++version;pendingRead=ticket;
    try {
      const value=await load();
      if(ticket!==version)return false;
      const recovered=recoverableReadFailure;recoverableReadFailure=false;current=value;
      feedback.read={state:recovered?'recovered':'ready',message:recovered?'Refresh recovered. Current observations and freshness are available again.':''};
      render(current,{busy,readUnavailable:false});lock(busy);emit();return true;
    }catch(error) {
      if(ticket!==version)return false;
      recoverableReadFailure=error?.status!==401;
      const lastRefresh=Number.isFinite(current?.now)?` Last successful refresh ${new Date(current.now).toLocaleTimeString()}.`:'';
      feedback.read={state:'unavailable',message:`Refresh unavailable: ${error.message}. Current target health is Unknown.${lastRefresh}`};
      render(current,{busy,readUnavailable:true,error});lock(busy);emit();return false;
    }finally{if(pendingRead===ticket)pendingRead=null;}
  }
  async function run(task,{pending='Working…',success='Action completed.'}={}) {
    if(busy)return {accepted:false,ok:false};
    busy=true;++version;feedback.action={state:'working',message:pending};lock(true);emit();
    let ok=false,result;
    try{result=await task();ok=true;feedback.action={state:'success',message:typeof success==='function'?success(result):success};}
    catch(error){feedback.action={state:'error',message:error.message};}
    finally {
      // Busy remains true through reconciliation. Old reads cannot replace it.
      try{await refresh({duringAction:true});}
      finally{busy=false;lock(false);emit();}
    }
    return {accepted:true,ok,result};
  }
  return {get busy(){return busy},refresh,run,
    announceBackground(message){feedback.background={message};emit();},
  };
}

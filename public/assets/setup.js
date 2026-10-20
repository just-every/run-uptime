const form=document.querySelector('form[action="/setup"]');
form?.addEventListener('submit',event=>{
 const value=event.submitter?.name==='skip'?'':form.dataset.website||form.elements.start_url?.value.trim()||'';
 let host='';try{host=new URL(value.includes('://')?value:'https://'+value).hostname}catch{}
 const progress=document.querySelector('#setup-progress');
 progress.textContent=host?`Looking at ${host}${form.dataset.place?` from ${form.dataset.place}`:''}…`:'Opening your first monitor…';
 progress.hidden=false;form.setAttribute('aria-busy','true');
});

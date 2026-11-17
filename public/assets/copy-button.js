// A "Copy" button for a value shown once: the text is read when clicked, and the button says what happened.
export function copyButton(label,text){
 const button=document.createElement('button'),original=`Copy ${label}`;
 button.type='button';button.textContent=original;
 button.onclick=async()=>{
  try{await navigator.clipboard.writeText(text());button.textContent='Copied'}catch{button.textContent='Select and copy it'}
  setTimeout(()=>{button.textContent=original},2500);
 };
 return button;
}

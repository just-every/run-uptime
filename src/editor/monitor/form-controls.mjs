// Shared, escaped form markup. Values are always data, including saved templates and response paths.
export const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const input=(field,label,value='',attributes='')=>`<label>${label}<input data-field="${field}" value="${escape(value)}" ${attributes}></label>`;
export const area=(field,label,value='',attributes='')=>`<label>${label}<textarea data-field="${field}" rows="3" ${attributes}>${escape(value)}</textarea></label>`;
export const select=(field,label,choices,value)=>`<label>${label}<select data-field="${field}">${choices.map(choice=>{const [key,text]=Array.isArray(choice)?choice:[choice,choice];return `<option value="${escape(key)}"${key===value?' selected':''}>${escape(text)}</option>`}).join('')}</select></label>`;
export const value=(root,field)=>root.querySelector(`[data-field="${field}"]`).value;
export function element(markup){const template=document.createElement('template');template.innerHTML=markup;return template.content.firstElementChild;}
export function readScalar(root){const text=value(root,'value'),type=value(root,'valueType');if(type==='number'){if(!text.trim()||!Number.isFinite(Number(text)))throw Error('Variable value: enter a finite number.');return Number(text)}if(type==='boolean'){if(!['true','false'].includes(text))throw Error('Boolean value: enter true or false.');return text==='true'}return text;}
export const scalarFields=(label,v='')=>select('valueType','Value type',[['string','Text'],['number','Number'],['boolean','True or false']],typeof v)+input('value',label,v,'maxlength="4096"');

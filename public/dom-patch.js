// The console redraws every view from markup on each five-second refresh. patch() reconciles a host's children with the
// new markup instead of replacing them, so a refresh changes only the nodes whose data changed: an open disclosure,
// focus, a typed value, a selection and the scroll position stay where the owner left them, and nothing flashes.
// Elements match by id or data-key, otherwise by tag in order. A details element keeps its open state once shown.
// Form controls keep what the owner typed or chose (attributes update; the live value is left alone).
// An element with data-owned="<identity>" is filled by its own module (a fetched list, a mounted form): once it is
// in the page, patch leaves it and everything inside it alone while the identity stays the same, and replaces it
// whole when the identity changes (another monitor, another revision).
export function patch(host,markup){
 const template=document.createElement('template');template.innerHTML=markup;
 patchChildren(host,template.content);
}
// True the first time it sees an element, so a module binds listeners and starts its reads once per mounted node.
const mounted=new WeakSet();
export function firstMount(element){if(!element||mounted.has(element))return false;mounted.add(element);return true}

const key=node=>node.nodeType===1?node.id||node.getAttribute('data-key')||null:null;
const same=(a,b)=>a.nodeType===b.nodeType&&a.nodeName===b.nodeName&&key(a)===key(b);
function patchChildren(parent,next){
 const keyed=new Map();
 for(const child of parent.childNodes){const k=key(child);if(k&&!keyed.has(k))keyed.set(k,child)}
 let current=parent.firstChild;
 for(const incoming of [...next.childNodes]){
  const k=key(incoming);let match=null;
  if(k){const found=keyed.get(k);if(found&&found.nodeName===incoming.nodeName){match=found;keyed.delete(k)}}
  else if(current&&!key(current)){
   // One stale unkeyed node before a match is dropped rather than shifting every later sibling.
   if(same(current,incoming))match=current;
   else if(current.nextSibling&&same(current.nextSibling,incoming)){const stale=current;current=current.nextSibling;stale.remove();match=current}
  }
  if(!match){parent.insertBefore(incoming,current);continue}
  if(match===current)current=current.nextSibling;else parent.insertBefore(match,current);
  update(match,incoming);
 }
 while(current){const stale=current;current=current.nextSibling;stale.remove()}
}
function update(node,incoming){
 if(node.nodeType!==1){if(node.nodeValue!==incoming.nodeValue)node.nodeValue=incoming.nodeValue;return}
 const owned=node.getAttribute('data-owned');
 if(owned!==null){if(owned!==incoming.getAttribute('data-owned'))node.replaceWith(incoming);return}
 const kept=node.localName==='details'?'open':null;
 for(const {name,value} of incoming.attributes)if(name!==kept&&node.getAttribute(name)!==value)node.setAttribute(name,value);
 for(const {name} of [...node.attributes])if(name!==kept&&!incoming.hasAttribute(name))node.removeAttribute(name);
 patchChildren(node,incoming);
}

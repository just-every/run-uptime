// Plain-language notes for the owner: capped in number and length, deduplicated.
export function createNotes(max){
  const notes=[],seen=new Set();
  return {
    add(text){const clipped=text.length>200?text.slice(0,199).trimEnd()+'…':text;if(notes.length<max&&!seen.has(clipped)){seen.add(clipped);notes.push(clipped)}},
    addOnce(key,text){if(!seen.has('key:'+key)){seen.add('key:'+key);this.add(text)}},
    list:()=>[...notes],
  };
}

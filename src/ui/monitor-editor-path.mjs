// Shareable editor state lives in the path; discovery jobs retain their own website and location.
export const newMonitorPath='/app/monitors/new';
export const discoveryPath=id=>`${newMonitorPath}/discovery/${encodeURIComponent(id)}`;
export const manualPath=({url='',network='public'}={})=>url||network==='private'?`${newMonitorPath}/manual/${network}/${encodeURIComponent(url)}`:`${newMonitorPath}/manual`;
export function editorState(path){
 const editing=path.match(/^\/app\/monitors\/([^/]+)\/edit\/?$/);
 const checking=path.match(/^\/app\/monitors\/new\/discovery\/([^/]+)\/?$/);
 const manual=path.match(/^\/app\/monitors\/new\/manual(?:\/(public|private)(?:\/(.*))?)?\/?$/);
 return {id:editing?decodeURIComponent(editing[1]):null,discovery:checking?decodeURIComponent(checking[1]):null,manual:!!manual,network:manual?.[1]??'public',url:manual?.[2]?decodeURIComponent(manual[2]):''};
}
export function legacyEditorPath(params){
 if(params.get('monitor'))return `/app/monitors/${encodeURIComponent(params.get('monitor'))}/edit`;
 if(params.get('discovery'))return discoveryPath(params.get('discovery'));
 if(params.has('manual'))return manualPath({url:params.get('url')??'',network:params.get('network')==='private'?'private':'public'});
 return newMonitorPath;
}

import {patch,firstMount} from './dom-patch.js';
import {mountBackup} from './archive-view.js';
import {renderDefinitions} from './definitions.js';
// Settings › Backup and files: the installation's backup and its restore (public/archive-view.js), then monitor files in and
// out and the past imports (public/definitions.js). Both are data-owned and filled once, so a chosen file, a preview or an
// open fold survives the console's refresh.
export function renderBackup({area,data,api,action}){
 if(!['owner','admin'].includes(data.access?.role)){patch(area,'<div class="settings-area"><section class="ui-card set-card"><h2>Backup and files</h2><p>An owner or administrator can download and restore backups and export monitor files. Ask the owner to import monitor files.</p></section></div>');return}
 patch(area,'<div class="settings-area"><section class="ui-card set-card archive-backup" id="backup" data-owned="backup" aria-labelledby="backup-heading"></section><div class="settings-area" id="monitor-files" data-owned="definitions"></div></div>');
 const backup=area.querySelector('#backup'),files=area.querySelector('#monitor-files');
 let refreshImports;
 if(firstMount(files)){
  if(data.access?.role==='owner')refreshImports=renderDefinitions({area:files,action});
  else{
   files.innerHTML='<section class="ui-card set-card"><h2>Monitor files</h2><p>The owner manages monitor file imports.</p><button type="button" id="definition-export">Export monitors</button></section>';
   files.querySelector('#definition-export').onclick=()=>action(async()=>{const file=await api('/api/definitions/export'),url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='uptime.monitors.json';a.click();URL.revokeObjectURL(url)},{success:'Monitors exported.'});
  }
 }
 if(firstMount(backup))mountBackup(backup,{api,action,onRestored:refreshImports});
}

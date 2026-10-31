import {patch,firstMount} from './dom-patch.js';
import {mountBackup} from './archive-view.js';
import {renderDefinitions} from './definitions.js';
// Settings › Backup and files: the installation's backup and its restore (public/archive-view.js), then monitor files in and
// out and the past imports (public/definitions.js). Both are data-owned and filled once, so a chosen file, a preview or an
// open fold survives the console's refresh.
export function renderBackup({area,api,action}){
 patch(area,'<div class="settings-area"><section class="ui-card set-card archive-backup" id="backup" data-owned="backup" aria-labelledby="backup-heading"></section><div class="settings-area" id="monitor-files" data-owned="definitions"></div></div>');
 const backup=area.querySelector('#backup'),files=area.querySelector('#monitor-files');
 if(firstMount(backup))mountBackup(backup,{api,action});
 if(firstMount(files))renderDefinitions({area:files,action});
}

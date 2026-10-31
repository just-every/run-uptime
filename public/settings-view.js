import {patch} from './dom-patch.js';
// Settings (/app/settings/<area>): the installation's configuration, one area per page, named in the order of the Settings
// menu (src/ui/console.html). This file only routes to the area's module, which loads the first time its area shows, so the
// daily sections never fetch Settings' modules. Each module fills its cards once (data-owned), so the console's refresh
// keeps a draft, an open disclosure or a pending request.
export const AREAS={alerts:'Alerts',general:'General',people:'People',integrations:'Integrations',backup:'Backup and files'};
const MODULES={alerts:()=>import('./settings-alerts.js').then(m=>m.renderAlerts),general:()=>import('./settings-general.js').then(m=>m.renderGeneral),people:()=>import('./settings-people.js').then(m=>m.renderPeople),integrations:()=>import('./settings-integrations.js').then(m=>m.renderIntegrations),backup:()=>import('./settings-backup.js').then(m=>m.renderBackup)};
const RENDER={};
// An area's first render waits for its module and draws only while the console still shows that area.
export function renderSettings(area,context){
 if(RENDER[area]){RENDER[area](context);return}
 MODULES[area]().then(render=>{RENDER[area]=render;if(context.showing(area))render(context)},()=>{if(context.showing(area))patch(context.area,'<p class="rows-note">This area could not load. Reload the page to try again.</p>')});
}

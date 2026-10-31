import {patch,firstMount} from './dom-patch.js';
import {metricsSection} from './metrics.js';
import {businessImportSettings} from './business-import-settings.js';
// Settings › Integrations: read-only metrics keys for Prometheus or another metrics reader (public/metrics.js), and Business
// imports, shown only on an installation linked to Business (public/business-import-settings.js).
export function renderIntegrations({area,api}){
 patch(area,'<div class="settings-area"><section class="ui-card set-card" id="metrics-tools" data-owned="metrics" aria-labelledby="metrics-heading"></section><section class="ui-card set-card" id="business-import-settings" data-owned="business-import" aria-labelledby="business-import-heading" hidden></section></div>');
 const metrics=area.querySelector('#metrics-tools');
 if(firstMount(metrics))metricsSection(metrics,api);
 businessImportSettings(area.querySelector('#business-import-settings'),api);
}

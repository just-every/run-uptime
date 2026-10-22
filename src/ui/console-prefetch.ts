// A monitor's page (/app/monitors/<id>) starts the reads it renders while the document is still parsing, before React
// hydrates and public/app.js loads: its own overview (/api/overview?monitor=<id>), recent checks, revisions and incidents,
// all at once. app.js takes each answer once through takePrefetched (public/app.js); later polls read fresh.
// Each read is the owner API itself with the page's own session; nothing is cached or stored.
export const consolePrefetchScript=`(function(){
var m=location.pathname.match(/^\\/app\\/monitors\\/([^/]+)\\/?$/);if(!m||!window.fetch)return;
var id=m[1],paths=['/api/overview?monitor='+id,'/api/monitors/'+id+'/history','/api/monitors/'+id+'/revisions','/api/monitors/'+id+'/incidents'],early={};
paths.forEach(function(path){early[path]={at:Date.now(),response:fetch(path,{headers:{'content-type':'application/json','x-uptime-time-zone':Intl.DateTimeFormat().resolvedOptions().timeZone},credentials:'same-origin',cache:'no-store'})}});
window.uptimePrefetch=early;
})()`
// public/app.js and the modules it imports, so the browser fetches the whole graph while React hydrates instead of in
// three waves after it (they are revalidated on each load). Keep it to app.js's static imports, all levels; a module left
// out only loads later, a module that is no longer imported is fetched for nothing.
// app.js first, then its complete static import/export closure in alphabetical order. Dynamic imports stay on demand.
export const CONSOLE_MODULES=['app.js',
 'action-feedback.mjs','alert-drills.js','archive-view.js','assets/alert-route-fallback.js','assets/alert-route-markup.js',
 'assets/alert-route.js','assets/contact-quiet.js','assets/failure-snapshot-view.js','business-import-settings.js',
 'catalog-dialogs.js','catalog.js','cleanup-debt.js','console-format.js','definition-changes.js','definitions.js','dom-patch.js',
 'evidence-access.js','failure-snapshots.js','flow-panel.js','followed-service.js','heartbeat-jobs.js','heartbeat-key.js',
 'incident-dependencies.js','incident-work-markup.js',
 'incident-work.js','locations.js','mail-panel.js','maintenance-calendar.js','maintenance-markup.js','metrics.js',
 'monitor-coverage.js','monitor-incidents.js','monitor-page.js','monitor-report.js','monitor-rules.js','monitor-status.js',
 'monitor-timeline.js','notification-dialogs.js','notification-help.js','notification-preferences.js','notifications.js',
 'pagespeed-panel.js','planned-maintenance.js','protocol-panel.js','report-jobs.js','report-render.js','settings-view.js','slow-policy.js',
 'transaction-panel.js','webhook-editor.js']

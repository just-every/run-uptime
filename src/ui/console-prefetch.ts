// A monitor's page (/app/monitors/<id>) starts the reads it renders while the document is still parsing, before React
// hydrates and public/app.js loads: its own overview (/api/overview?monitor=<id>), recent checks, revisions and incidents,
// all at once. app.js takes each answer once through takePrefetched (public/app.js); later polls read fresh.
// Each read is the owner API itself with the page's own session; nothing is cached or stored.
export const consolePrefetchScript=`(function(){
var m=location.pathname.match(/^\\/app\\/monitors\\/([^/]+)\\/?$/);if(!m||!window.fetch)return;
var id=m[1],paths=['/api/overview?monitor='+id,'/api/monitors/'+id+'/history','/api/monitors/'+id+'/revisions','/api/monitors/'+id+'/incidents'],early={};
paths.forEach(function(path){early[path]={at:Date.now(),response:fetch(path,{headers:{'content-type':'application/json'},credentials:'same-origin',cache:'no-store'})}});
window.uptimePrefetch=early;
})()`

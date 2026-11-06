// The installation's one time zone (Settings › General), which alerts, reports, maintenance and job schedules use. The
// console remembers it from each overview it reads (public/app.js); a form's own zone field starts from it and still takes
// another zone for that form alone.
let zone=null;
export function rememberZone(overview){if(overview?.timeZone)zone=overview.timeZone}
export const installationZone=()=>zone??Intl.DateTimeFormat().resolvedOptions().timeZone;
// The zones a zone field offers: the installation's first, then every zone this browser knows.
export const zoneChoices=()=>[...new Set([installationZone(),...Intl.supportedValuesOf('timeZone'),'UTC'])];

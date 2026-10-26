// Evidence coverage for one window (Last 24 hours or Last 7 days), from the availability fields /api/overview returns:
// one bar split into passed, failing, Unknown, maintenance and paused time, and a short label. The bar's green is only time a scheduled
// check passed; Unknown is the hatched grey gap of time with no valid result, never counted as up.
import {escape,humaneDuration} from './console-format.js';

// The rule the coverage figures follow, stated once on the list and once in a monitor page's Reports.
export const COVERAGE_RULE='Uptime counts only observed time. History keeps earlier revisions. Maintenance and paused time are shown separately; missing results stay Unknown.';

const valid=metrics=>metrics&&[metrics.upMs,metrics.notPassingMs,metrics.unknownMs,metrics.observedMs,metrics.windowMs].every(Number.isFinite)&&metrics.windowMs>0;

// part as a share of whole, to two decimals. A share between 0 and 0.01% reads "under 0.01%" and one between 99.99% and
// 100% "over 99.99%", so neither rounds to a figure it is not; otherwise a passing share is rounded down and a failing
// or Unknown share up, so a rounded figure never claims more passing or less missing evidence than there was. fixed
// gives "0.00%" and "100.00%" for the whole-window shares; the passing share of observed time reads "100%".
export function share(part,whole,round,{fixed=true}={}){
 const hundredths=part*10000/whole;
 if(hundredths>0&&hundredths<1)return 'under 0.01%';
 if(hundredths>9999&&hundredths<10000)return 'over 99.99%';
 const value=round(hundredths)/100;
 return `${fixed?value.toFixed(2):value}%`;
}

// A label that wraps keeps its " · " at the end of a line, never at the start of the next.
const keepLine=text=>`<span class="keep-line">${escape(text)}</span>`;

// "100% passing · 9 s of 24 h", as markup: the passing share of observed time, then how much of the window was
// observed, rounded down; the monitor page says "9 s observed of 24 h". A no-break space keeps "of 24 h" whole.
function coverageLabel(metrics,{observed=false}={}){
 if(!valid(metrics))return 'Unknown';
 const of=`${humaneDuration(metrics.observedMs)}${observed?' observed':''} of\u00a0${humaneDuration(metrics.windowMs)}`;
 return `${keepLine(metrics.observedMs>0?`${share(metrics.upMs,metrics.observedMs,Math.floor,{fixed:false})} passing ·`:'Unknown ·')} ${escape(of)}`;
}
const unknownShare=metrics=>share(metrics.unknownMs,metrics.windowMs,Math.ceil);

// Shares of the whole window, for the bar's accessible name: the same Unknown figure as the visible Unknown line.
function windowShares(metrics){
 const {upMs,notPassingMs,windowMs}=metrics;
 return `passed ${share(upMs,windowMs,Math.floor)} of the window, failing ${share(notPassingMs,windowMs,Math.ceil)}, Unknown ${unknownShare(metrics)}, maintenance ${share(metrics.maintenanceMs??0,windowMs,Math.ceil)}, paused ${share(metrics.pausedMs??0,windowMs,Math.ceil)}`;
}

// size 'compact' for a list cell: the bar over its label. 'large' for the monitor page: the bar with the label and the
// Unknown share of the window beside it (under it in a narrow card). Only the share is shown for Unknown: the window
// less the observed time is implied, and a rounded Unknown span beside a rounded observed time read as a contradiction.
// since: when the monitor's first revision was saved. While that is inside the window the monitor has not existed for the
// whole window, so the time before it is neither passing nor missing: the bar covers the monitor's life so far and the label
// says "Since 7:54 PM: 100% passing". now is the overview's server time.
const startClock=t=>new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
export function coverage(metrics,windowLabel,size='compact',{since,now}={}){
 const large=size==='large',young=valid(metrics)&&Number.isFinite(since)&&Number.isFinite(now)&&since>now-metrics.windowMs;
 let label;
 if(young){
  const before=since-(now-metrics.windowMs);
  label=`<span class="keep-line">Since ${escape(startClock(since))}: ${metrics.observedMs>0?`${share(metrics.upMs,metrics.observedMs,Math.floor,{fixed:false})} passing`:'waiting for the first result'}</span>`;
  metrics={...metrics,windowMs:metrics.windowMs-before,unknownMs:Math.max(0,metrics.unknownMs-before)};
 }else label=coverageLabel(metrics,{observed:large});
 if(!valid(metrics))return `<div class="coverage ${size}"><div class="coverage-bar" role="img" aria-label="${escape(windowLabel)}: coverage Unknown"><span class="coverage-segment unknown" style="flex-grow:1"></span></div><div class="coverage-copy"><p class="coverage-label">${label}</p></div></div>`;
 const segments=[['passed',metrics.upMs],['failing',metrics.notPassingMs],['unknown',metrics.unknownMs],['maintenance',metrics.maintenanceMs??0],['paused',metrics.pausedMs??0]].filter(([,ms])=>ms>0);
 const bar=`<div class="coverage-bar" role="img" aria-label="${escape(`${windowLabel}: ${windowShares(metrics)}`)}">${segments.map(([kind,ms])=>`<span class="coverage-segment ${kind}" style="flex-grow:${ms}"></span>`).join('')}</div>`;
 const unknown=large&&!(young&&(metrics.unknownMs<metrics.windowMs*0.2||metrics.unknownMs<300000))?`<p class="coverage-unknown"><strong>${escape(unknownShare(metrics))}</strong> Unknown (no valid result)</p>`:'';
 return `<div class="coverage ${size}">${bar}<div class="coverage-copy"><p class="coverage-label">${label}</p>${unknown}${[['Maintenance',metrics.maintenanceMs],['Paused',metrics.pausedMs]].filter(([,ms])=>ms>0).map(([label,ms])=>`<p class="coverage-excluded">${escape(humaneDuration(ms))} ${label}</p>`).join('')}</div></div>`;
}

// The key for each part of the bar, shown once on the monitor page.
export const coverageLegend='<ul class="coverage-legend"><li><span class="coverage-key passed" aria-hidden="true"></span>Passed</li><li><span class="coverage-key failing" aria-hidden="true"></span>Failing</li><li><span class="coverage-key unknown" aria-hidden="true"></span>Unknown</li><li><span class="coverage-key maintenance" aria-hidden="true"></span>Maintenance</li><li><span class="coverage-key paused" aria-hidden="true"></span>Paused</li></ul>';

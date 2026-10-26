// How a monitor page's "Up or down" table sits in its card, measured in the page after every draw, resize and font load, so
// no word of the table splits and nothing runs past its card whatever the names, rule words and width (U15 G-B…G-E):
//  - beside: the Rule column beside one column per location (each location's column holds its widest word); a rule whose
//    own widest word, or whose open editor, does not fit the Rule column spans the card, over its values ("spans");
//  - over: one or two locations whose columns leave no room for a Rule column share the card's width, and every rule spans
//    the card over what each location saw;
//  - stacked: three locations that do not fit beside, and always three in one column (as the spec draws a phone): each rule
//    over one wrapping line of what each location saw, each value naming its location. A protocol check, which has no cell
//    per location, shows its location heads as that line.
// One probe layout (data-fit="measure", public/monitor-page.css) reads every location column's widest word and each rule's
// own; it all runs in one task, so nothing is painted between the probe and the chosen layout.
const RULE_MIN=120;
const tracks=table=>getComputedStyle(table).gridTemplateColumns.split(/\s+/).map(parseFloat).filter(Number.isFinite);
export function fitTable(table,{oneColumn}){
 const n=Number(table.dataset.locations),rows=[...table.querySelectorAll(':scope > tbody > tr:not(.whole)')];
 if(!n){table.dataset.fit='beside';return {mode:'beside',spans:new Set()}}
 table.dataset.fit='measure';
 const gap=parseFloat(getComputedStyle(table).columnGap)||0,width=table.clientWidth,locations=tracks(table).slice(1);
 const need=rows.map(tr=>[tr,tr.querySelector(':scope > th').getBoundingClientRect().width]);
 const fitsOver=locations.reduce((sum,w)=>sum+w,0)+gap*(n-1)<=width;
 table.dataset.fit='beside';
 const rule=tracks(table)[0]??0,mode=rule>=RULE_MIN&&!(oneColumn&&n===3)?'beside':n<3&&fitsOver?'over':'stacked';
 table.dataset.fit=mode;
 const spans=new Set();
 for(const [tr,w] of need){const span=mode==='beside'&&w>rule+0.5;tr.classList.toggle('spans',span);if(span)spans.add(tr.dataset.key)}
 return {mode,spans};
}

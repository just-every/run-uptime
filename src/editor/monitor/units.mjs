// An optional "responds within" limit typed in seconds, as the whole milliseconds the API takes; '' stays empty.
export function optionalSecondsToMilliseconds(value){
 const text=String(value).trim();
 if(text==='')return '';
 const seconds=Number(text);
 if(!Number.isFinite(seconds)||seconds<=0)throw Error('Responds within: a number of seconds, such as 3 or 0.5.');
 return String(Math.round(seconds*1000));
}
export function minutesToMilliseconds(value){return scaledMilliseconds(value,60000,'Check time');}
export function secondsToMilliseconds(value){return scaledMilliseconds(value,1000,'Response timeout');}
function scaledMilliseconds(value,scale,label){
 if(String(value).trim()==='')throw Error(`${label} is required.`);
 const scaled=Number(value)*scale,rounded=Math.round(scaled);
 if(!Number.isSafeInteger(rounded)||rounded<0||Math.abs(scaled-rounded)>0.000001)throw Error(`${label} must represent a whole number of milliseconds.`);
 return rounded;
}

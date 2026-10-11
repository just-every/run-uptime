export function minutesToMilliseconds(value){return scaledMilliseconds(value,60000,'Check time');}
export function secondsToMilliseconds(value){return scaledMilliseconds(value,1000,'Response timeout');}
function scaledMilliseconds(value,scale,label){
 if(String(value).trim()==='')throw Error(`${label} is required.`);
 const scaled=Number(value)*scale,rounded=Math.round(scaled);
 if(!Number.isSafeInteger(rounded)||rounded<0||Math.abs(scaled-rounded)>0.000001)throw Error(`${label} must represent a whole number of milliseconds.`);
 return rounded;
}

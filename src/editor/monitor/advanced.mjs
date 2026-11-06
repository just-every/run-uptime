import {TYPE_TIMING,checkTypeOf} from './protocol-fields.mjs';
// "Advanced" holds what most monitors never change, so it stays closed until a value inside is not what the type starts from:
// the defaults are the new monitor's (`defaults`, manual.mjs NEW_MONITOR) with the type's own timing on top (TYPE_TIMING).
export function advancedHolds(definition,defaults,{ownExternalUrl=''}={}){
 const type=checkTypeOf(definition),timing=TYPE_TIMING[type];
 const usual={timeoutSeconds:timing.timeoutSeconds,freshnessMinutes:timing.freshnessMinutes,retries:timing.retries??defaults.retries};
 return definition.network==='private'
  ||type==='http'&&(definition.method??'GET')!==defaults.method
  ||definition.timeoutMs/1000!==usual.timeoutSeconds
  ||definition.retries!==usual.retries
  ||definition.freshnessMs/60000!==usual.freshnessMinutes
  ||Boolean(definition.dns?.approved?.values?.length)
  ||Boolean(ownExternalUrl)
  ||type==='http'&&Boolean(definition.request?.credentialRef)
  ||Boolean(definition.tlsTrust&&definition.tlsTrust.mode!=='default');
}
// A fold that holds something not usual opens; one the owner opened stays open.
export function openAdvanced(root,open=true){if(open)root.querySelector('.advanced-fold').open=true}
// A field the browser refuses to save sits inside a closed fold: open the folds around it so it can take focus.
export function openFoldsAround(event){for(let fold=event.target.closest('details');fold;fold=fold.parentElement?.closest('details'))fold.open=true}

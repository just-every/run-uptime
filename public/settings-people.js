import {patch,firstMount} from './dom-patch.js';
// Settings › People: Accounts, everyone who can sign in, each once with their role, and Invite someone, which takes a role;
// then Security and keys (second factors, recovery codes, the factor policy, monitoring and CI keys). Both cards are filled
// once by public/assets/access-member-controls.js, which mounts them together because every member write asks Security and
// keys for a fresh second factor when one is due.
export function renderPeople({area,api,action,closeConsole,navigateToLogin,closed}){
 patch(area,'<div class="settings-area" id="access-member-controls"><section class="ui-card set-card" id="people-accounts" data-owned="accounts" aria-labelledby="accounts-heading"></section><section class="ui-card" id="security-controls" data-owned="security" aria-labelledby="security-heading"></section></div>');
 const accounts=area.querySelector('#people-accounts'),security=area.querySelector('#security-controls');
 if(firstMount(accounts))void import('./assets/access-member-controls.js').then(({accessMemberControls})=>accessMemberControls({accounts,security,api,action,closeConsole,navigateToLogin,closed}));
}

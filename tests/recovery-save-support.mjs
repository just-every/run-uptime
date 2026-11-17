import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Clipboard and download are browser edges; the codes come from real enrollment or replacement.
export async function proveRecoverySave({page,scope,issuedCodes}){
 const text=issuedCodes.join('\n')+'\n';
 assert.deepEqual((await scope.locator('[data-recovery-codes]').textContent()).split('\n'),issuedCodes);
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await scope.getByRole('button',{name:'Copy all',exact:true}).click();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),text,'copy preserves every issued character');
 const status=scope.locator('[data-recovery-status]');await status.filter({hasText:/.+/}).waitFor();const copiedStatus=await status.textContent();
 await page.evaluate(()=>{window.nativeClipboardWrite=navigator.clipboard.writeText.bind(navigator.clipboard);navigator.clipboard.writeText=async()=>{throw new DOMException('Clipboard unavailable','NotAllowedError')}});
 await scope.getByRole('button',{name:'Copy all',exact:true}).click();
 await page.waitForFunction(({node,previous})=>node.textContent.trim()&&node.textContent!==previous,{node:await status.elementHandle(),previous:copiedStatus});
 assert.equal(await scope.getByRole('button',{name:'Download',exact:true}).isEnabled(),true,'download stays available when clipboard access fails');
 await page.evaluate(()=>{navigator.clipboard.writeText=window.nativeClipboardWrite;delete window.nativeClipboardWrite});
 const directory=await mkdtemp(join(tmpdir(),'u-codes-'));
 try{
  const pending=page.waitForEvent('download');await scope.getByRole('button',{name:'Download',exact:true}).click();const download=await pending;
  const file=join(directory,'codes.txt');await download.saveAs(file);
  assert.equal(await readFile(file,'utf8'),text,'download preserves all issued values for verification');
 }finally{await rm(directory,{recursive:true,force:true})}
}

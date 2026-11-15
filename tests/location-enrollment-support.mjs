import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {once} from 'node:events';

// The command shown by Locations runs the downloaded tool with rer's runtime,
// without node or pnpm on PATH. It exchanges a real one-use key and enrolls.
export async function joinFromLocations(page,origin,{root,directory}){
 await page.goto(origin+'/app/locations');await page.locator('#locations-table').waitFor();
 const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/runners'&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Add location',exact:true}).click();
 const identity=await (await created).json();await page.locator('#location-command').waitFor();
 const original=await page.locator('#location-command').innerText();
 await page.reload();await page.locator('#locations-table').waitFor();
 const row=page.locator(`[data-key="location-${identity.runnerId}"]`);
 await row.getByRole('button',{name:/Show join command/}).click();await page.locator('#location-command').waitFor();
 const command=await page.locator('#location-command').innerText();
 assert.notEqual(command,original,'a fresh command replaces the spent or lost command');
 const parts=/^curl -fsSL (\S+) -o (\S+) && rer (.+)$/.exec(command);
 assert.ok(parts,'the displayed command uses the installer-provided runtime');
 const args=parts[3].split(' ');assert.equal(args[0],'--script');assert.equal(args[1],parts[2]);
 const previousKey=original.split(' ').at(-1);
 assert.equal((await page.request.post(origin+'/api/runner/join',{data:{joinKey:previousKey}})).status(),403,'the replaced key cannot join');
 const download=await page.request.get(parts[1]);assert.equal(download.status(),200);
 const folder=join(directory,'downloaded-location');await mkdir(folder,{recursive:true});
 await writeFile(join(folder,parts[2]),await download.body(),{mode:0o600});
 const child=spawn(process.execPath,[join(root,'node_modules/@runeditrun/rer/global/rer.mjs'),'run',...args],{cwd:folder,env:{HOME:process.env.HOME,PATH:join(folder,'no-path-tools'),UPTIME_RUNNER_BROWSER:'off'},stdio:'ignore'});
 try{
  const end=Date.now()+30000;
  for(;;){
   const rows=await (await page.request.get(origin+'/api/runners')).json();
   if(rows.find(r=>r.runnerId===identity.runnerId)?.lastContactAt!==null)break;
   assert.equal(child.exitCode,null,'the displayed command remains running');assert.ok(Date.now()<end,'the downloaded location joins');
   await new Promise(resolve=>setTimeout(resolve,150));
  }
  await page.locator('#location-joined').waitFor({timeout:12000});
  await page.locator('#check-all-monitors').uncheck();await page.getByRole('button',{name:'Done',exact:true}).click();
  return JSON.parse(await readFile(join(folder,'uptime-runner/location.json'),'utf8'));
 }finally{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit')}}
}

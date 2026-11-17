import assert from 'node:assert/strict';

// Continue the fresh-install journey through the account and installation
// controls, checking persisted state at the public session and overview doors.
export async function ownerProfileJourney(page,origin){
 const initial=(await (await page.request.get(origin+'/auth/session')).json()).operator;
 const profile={name:'Synthetic owner',email:'synthetic-uptime-owner@example.test',installation:'Brightwell Support'};
 await page.goto(origin+'/app/settings/people');
 let row=page.locator(`[data-member-id="${initial.id}"]`);
 await row.locator('summary').first().click();await row.locator('.member-profile summary').click();
 await row.getByLabel('Your name',{exact:true}).fill(profile.name);await row.getByLabel('Your name',{exact:true}).press('Tab');
 await page.waitForFunction(async name=>(await (await fetch('/auth/session')).json()).operator.displayName===name,profile.name);
 await page.goto(origin+'/app/settings/people');row=page.locator(`[data-member-id="${initial.id}"]`);await row.locator('summary').first().click();await row.locator('.member-profile summary').click();
 await row.getByLabel('Your email',{exact:true}).fill(profile.email);await row.getByLabel('Your email',{exact:true}).press('Tab');
 await page.waitForFunction(async email=>(await (await fetch('/auth/session')).json()).operator.email===email,profile.email);
 await page.goto(origin+'/app/settings/general');
 await page.getByRole('textbox',{name:'Installation name',exact:true}).fill(profile.installation);await page.getByRole('textbox',{name:'Installation name',exact:true}).press('Tab');
 await page.waitForFunction(async name=>(await (await fetch('/api/overview')).json()).installationName===name,profile.installation);
 await page.reload();assert.equal(await page.getByRole('textbox',{name:'Installation name',exact:true}).inputValue(),profile.installation);
 assert.ok((await page.locator('[data-rer-name]').first().innerText()).includes(profile.installation));
 const overview=await (await page.request.get(origin+'/api/overview')).json();assert.equal(overview.notifications.ownerEmail,profile.email);
 const people=await (await page.request.get(origin+'/api/access/members')).json();
 await page.goto(origin+'/signin');
 const links=await page.locator('a[href^="/auth/dev/enter"]').evaluateAll(links=>links.map(link=>link.getAttribute('href')));
 assert.equal(links.length,people.filter(person=>['active','invited'].includes(person.status)).length,'test choices are the real admitted People');
 for(const link of links){await page.goto(origin+link);const session=(await (await page.request.get(origin+'/auth/session')).json()).operator;assert.ok(people.some(person=>person.id===session.id),'each local choice signs in a recorded person')}
 // Restore the account address so the rest of this whole-install journey uses
 // the same native provider address it supplied to setup.
 const restored=await page.request.post(origin+'/api/profile',{headers:{origin},data:{email:initial.email}});assert.equal(restored.status(),200);
 const restoredName=await page.request.post(origin+'/api/profile',{headers:{origin},data:{displayName:initial.displayName}});assert.equal(restoredName.status(),200);
}

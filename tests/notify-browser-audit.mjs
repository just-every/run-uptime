import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const require=createRequire(import.meta.url);

export async function assertNoSampleHost(page,label){
 assert.doesNotMatch(await page.locator('body').innerText(),/acme\.local/i,label+' contains no sample host');
 const inputs=await page.locator('input').evaluateAll(elements=>elements.map(element=>element.value+' '+element.placeholder).join('\n'));
 assert.doesNotMatch(inputs,/acme\.local/i,label+' inputs contain no sample host');
}
export async function assertTabsFit(page,width){
 const geometry=await page.evaluate(()=>{
  const bar=document.querySelector('.tabs,.tabbar,.sidebar nav,.editor-sidebar nav');
  if(!bar)return null;
  return {width:bar.clientWidth,scroll:bar.scrollWidth,links:[...bar.querySelectorAll('a,button,[role=tab]')].map(element=>{const r=element.getBoundingClientRect();return {name:element.textContent.trim(),left:r.left,right:r.right,top:r.top,bottom:r.bottom}})};
 });
 assert.ok(geometry,'navigation bar exists');
 assert.ok(geometry.scroll<=geometry.width+1,`tabs fit ${width}px without scrolling`);
 assert.ok(geometry.links.some(link=>/SIGN OUT/i.test(link.name)),'Sign out is included in navigation geometry');
 for(const link of geometry.links){assert.ok(link.left>=-1&&link.right<=width+1,`${link.name} fits ${width}px viewport`);assert.ok(link.bottom>link.top,`${link.name} remains visible`)}
 return geometry;
}
async function notificationLabelGeometry(page){
 return page.evaluate(()=>{
  const link=document.querySelector('.sidebar nav [data-view="notifications"]');
  if(!link)return null;
  const textNode=[...link.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.includes('Notifications'));
  if(!textNode)return {missingLabelText:true};
  // The icon is the aria-hidden line icon element that comes before the label text in the link.
  const text=textNode.textContent,labelStart=text.indexOf('Notifications'),iconElement=textNode.previousSibling;
  const rects=range=>[...range.getClientRects()].map(rect=>({left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height}));
  const labelRange=document.createRange();labelRange.setStart(textNode,labelStart);labelRange.setEnd(textNode,labelStart+'Notifications'.length);
  const iconRect=iconElement?.nodeType===Node.ELEMENT_NODE&&iconElement.matches('.ui-icon[aria-hidden="true"]')?iconElement.getBoundingClientRect():null;
  const icon=iconRect&&{left:iconRect.left,right:iconRect.right,top:iconRect.top,bottom:iconRect.bottom,width:iconRect.width,height:iconRect.height};
  const bounds=element=>{const rect=element.getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height,clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight}};
  const nav=link.closest('nav'),links=[...nav.querySelectorAll('a')].map(element=>({name:element.textContent.trim(),...bounds(element)}));
  return {viewport:innerWidth,viewportHeight:innerHeight,scrollY,documentScrollWidth:document.documentElement.scrollWidth,bodyScrollWidth:document.body.scrollWidth,nav:bounds(nav),link:bounds(link),icon,labelRects:rects(labelRange),links};
 });
}
function assertNotificationLabelGeometry(geometry,width){
 assert.ok(geometry,'Notifications navigation link exists');
 assert.equal(geometry.viewport,width,'desktop navigation was measured at the requested viewport');
 assert.ok(!geometry.missingLabelText,'Notifications text is present in the link');
 assert.equal(geometry.labelRects.length,1,`Notifications renders on one line at ${width}px: ${JSON.stringify(geometry.labelRects)}`);
 const label=geometry.labelRects[0],link=geometry.link,icon=geometry.icon;
 assert.ok(label.width>0&&label.height>0,'Notifications text has visible rendered geometry');
 assert.ok(label.top>=0&&label.bottom<=geometry.viewportHeight,'Notifications text is inside the visible viewport');
 assert.ok(label.left>=link.left&&label.right<=link.right,`Notifications text is inside its link: ${JSON.stringify({label,link})}`);
 assert.ok(link.scrollWidth<=link.clientWidth+1,'Notifications link content is not clipped');
 assert.ok(link.height>=44,'Notifications link remains a usable pointer target');
 assert.ok(icon&&icon.width>0&&icon.height>0,'Notifications icon has visible rendered geometry');
 assert.ok(icon.top>=0&&icon.bottom<=geometry.viewportHeight,'Notifications icon is inside the visible viewport');
 assert.ok(icon.left>=link.left&&icon.right<=link.right&&icon.top>=link.top&&icon.bottom<=link.bottom,'Notifications icon is inside its usable link');
 assert.ok(icon.right<=label.left+1,'Notifications icon and label do not overlap');
 for(const item of geometry.links){
  const horizontalOverlap=Math.min(link.right,item.right)-Math.max(link.left,item.left),verticalOverlap=Math.min(link.bottom,item.bottom)-Math.max(link.top,item.top);
  if(item.name!=='Notifications')assert.ok(horizontalOverlap<=0||verticalOverlap<=0,`Notifications link does not overlap ${item.name}`);
 }
 return geometry;
}
export async function auditNotificationView({page,label,width,evidence,pageErrors,navigation=true}){
 await page.setViewportSize({width,height:900});
 await page.waitForTimeout(100);
 await page.evaluate(()=>document.fonts.ready);
 const extent=await page.evaluate(()=>({document:document.documentElement.scrollWidth,body:document.body.scrollWidth,width:innerWidth}));
 assert.ok(extent.document<=width+1&&extent.body<=width+1,label+' no horizontal scroll');
 if(navigation){
  await assertTabsFit(page,width);
  for(const narrow of [390,320]){await page.setViewportSize({width:narrow,height:900});await assertTabsFit(page,narrow)}
  await page.setViewportSize({width,height:900});
 }
 if(width===1440&&await page.locator('.sidebar nav [data-view="notifications"]').count()){
  const selected=await page.locator('.sidebar nav [data-view="notifications"]').getAttribute('aria-current');
  if(selected==='page'){
   await page.evaluate(()=>window.scrollTo(0,0));
   const geometry=await notificationLabelGeometry(page);
   const navigationEvidence=join(evidence,'navigation-correction');
   await mkdir(navigationEvidence,{recursive:true});
   await writeFile(join(navigationEvidence,'notifications-1440-geometry.json'),JSON.stringify({label,width,...geometry},null,2));
   await page.locator('.sidebar').screenshot({path:join(navigationEvidence,'notifications-1440-sidebar.png')});
   assertNotificationLabelGeometry(geometry,width);
  }
 }
 await page.evaluate(require('node:fs').readFileSync(require.resolve('axe-core/axe.min.js'),'utf8'));
 const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
 const severe=result.violations.filter(item=>['serious','critical'].includes(item.impact)).map(item=>({id:item.id,impact:item.impact,targets:item.nodes.map(node=>node.target)}));
 // Store only audit facts: axe's HTML snapshots could retain transient credentials.
 await writeFile(join(evidence,`${label}-${width}-axe.json`),JSON.stringify({severe,violations:result.violations.map(item=>({id:item.id,impact:item.impact})),passes:result.passes.length},null,2),{mode:0o600});
 await page.screenshot({path:join(evidence,`${label}-${width}.png`),fullPage:true,mask:[page.locator('.one-time-secret')]});
 assert.deepEqual(severe,[],label+' serious/critical axe violations');
 assert.deepEqual(pageErrors,[],label+' pageerrors');
 await assertNoSampleHost(page,label);
 return {state:label,width,overflow:extent,seriousCritical:0,pageErrors:0};
}

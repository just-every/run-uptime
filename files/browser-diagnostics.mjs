import {chromium} from './run-uptime/node_modules/playwright/index.mjs';
const launch=chromium.launch.bind(chromium),start=Date.now();
chromium.launch=async options=>{
 const browser=await launch(options),newContext=browser.newContext.bind(browser);
 browser.newContext=async options=>{
  const context=await newContext(options);
  context.on('page',page=>{
   page.on('response',response=>{
    const url=new URL(response.url());
    if(url.pathname==='/api/credentials'||response.status()>=400)console.log('BROWSER_RESPONSE',Date.now()-start,response.request().method(),url.pathname,response.status());
   });
   page.on('requestfailed',request=>console.log('BROWSER_REQUEST_FAILED',Date.now()-start,new URL(request.url()).pathname,request.failure()?.errorText));
   page.on('pageerror',error=>console.log('BROWSER_PAGE_ERROR',Date.now()-start,error.name));
   page.on('framenavigated',frame=>{if(frame===page.mainFrame())console.log('BROWSER_DOCUMENT',Date.now()-start,new URL(frame.url()).pathname)});
  });return context;
 };return browser;
};

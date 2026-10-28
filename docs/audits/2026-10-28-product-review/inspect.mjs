import {createRequire} from 'node:module';import {writeFileSync} from 'node:fs';
const require=createRequire('/workspace/galeng-engine/apps/editor/package.json');const {chromium}=require('@playwright/test');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage();let errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',async route=>{const u=new URL(route.request().url());u.port='3848';const res=await route.fetch({url:u.href});await route.fulfill({response:res});});
let samples=[];
for(const mode of ['dialogue','explore']){
 for(const [width,height] of [[1440,900],[1280,720],[1024,768]]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:5173/#'+mode);
  await page.waitForSelector(mode==='explore'?'[data-testid="explore-workspace"]':'.v2-topbar',{timeout:15000}).catch(()=>{});
  await page.waitForTimeout(350);
  const data=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,text:document.body.innerText.slice(0,14000),offscreenButtons:[...document.querySelectorAll('button')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.right>innerWidth+2||r.left< -2)}).map(e=>({text:e.textContent,title:e.title})),dialogs:[...document.querySelectorAll('[role=dialog]')].length}));
  samples.push({mode,...data});await page.screenshot({path:`/workspace/galeng-audit/product-b76f5e2/${mode}-${width}.png`,fullPage:false});
 }
}
writeFileSync('/workspace/galeng-audit/product-b76f5e2/browser.json',JSON.stringify({samples,errors},null,2));await browser.close();

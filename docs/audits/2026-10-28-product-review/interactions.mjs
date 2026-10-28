import {createRequire} from 'node:module';import {writeFileSync} from 'node:fs';
const require=createRequire('/workspace/galeng-engine/apps/editor/package.json');const {chromium}=require('@playwright/test');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1280,height:720}});
await page.route('**/api/**',async route=>{const u=new URL(route.request().url());u.port='3848';const response=await route.fetch({url:u.href});await route.fulfill({response});});
await page.goto('http://127.0.0.1:5173/#dialogue');await page.locator('.v2-scene').filter({hasText:'dlg_butler'}).click();await page.waitForTimeout(300);
await page.screenshot({path:'/workspace/galeng-audit/product-b76f5e2/dialogue-selected-1280.png'});
const normal=await page.locator('body').innerText();
await page.locator('.v2-topbar button').filter({hasText:'New scene'}).click();await page.getByRole('dialog').waitFor();
let focus=[];for(let i=0;i<9;i++){focus.push(await page.evaluate(()=>({tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.slice(0,80),title:document.activeElement?.getAttribute('title'),insideDialog:!!document.activeElement?.closest('[role=dialog]')})));await page.keyboard.press('Tab');}
const modal=await page.getByRole('dialog').getAttribute('aria-modal');await page.keyboard.press('Escape');
writeFileSync('/workspace/galeng-audit/product-b76f5e2/interactions.json',JSON.stringify({normal,modal,focus},null,2));await browser.close();

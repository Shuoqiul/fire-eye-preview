const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'../../cf-app/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});
await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('http://127.0.0.1:5200');await page.waitForFunction(()=>window.fireEyePreview?.ready&&window.FireMotion,null,{timeout:60000});await page.evaluate(()=>fireEyeCounterfactual.open());
for(const type of ['heavy_rain','thunderstorm','prescribed_burn']){
 await page.locator('[data-event="'+type+'"]').click();assert.equal(await page.locator('#cf-startH').count(),0);assert.equal(await page.locator('#cf-durationH').count(),0);
 assert.equal(await page.evaluate(()=>fireEyeCounterfactual.event.startH),0);assert.equal(await page.locator('#cf-motion-direction').count(),1);assert.equal(await page.locator('#cf-motion-speed').count(),1);
 await page.locator('#cf-motion-direction').fill('90');await page.locator('#cf-motion-direction').dispatchEvent('input');await page.locator('#cf-motion-speed').fill('24');await page.locator('#cf-motion-speed').dispatchEvent('input');
 assert.equal(await page.evaluate(()=>fireEyeCounterfactual.event.motion.speed),24);await page.waitForTimeout(750);
 const result=await page.evaluate(()=>({sources:!!fireEyePreview.map.getSource('cf-area-next'),base:fireEyePreview.map.getPaintProperty('cf-area-fill','raster-opacity'),next:fireEyePreview.map.getPaintProperty('cf-area-next-fill','raster-opacity')}));assert.ok(result.sources);assert.ok(result.base>=0&&result.base<=1);console.log(type,result);
}
await page.screenshot({path:'/tmp/cf-motion-desktop.png'});
await page.locator('[data-event="high_wind"]').click();assert.equal(await page.locator('#cf-startH').count(),1);assert.equal(await page.locator('#cf-durationH').count(),1);
await page.evaluate(()=>fireEyeCounterfactual.close());assert.equal(await page.evaluate(()=>fireEyePreview.map.getStyle().layers.filter(l=>l.id.startsWith('cf-')).length),0);
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{fireEyeCounterfactual.open();fireEyeCounterfactual.setEvent(fireEyeCounterfactual.defaults('heavy_rain',[-96,38]));});await page.waitForTimeout(600);await page.screenshot({path:'/tmp/cf-motion-mobile.png'});assert.deepEqual(errors,[]);console.log('motion browser PASS');await browser.close();

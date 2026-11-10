const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'../../cf-app/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});
const base=process.env.CF_URL||'http://127.0.0.1:5201';
await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());await page.goto(base);await page.waitForFunction(()=>window.fireEyePreview?.ready&&window.FireMotion,null,{timeout:60000});await page.evaluate(()=>fireEyeCounterfactual.open());
for(const type of ['heavy_rain','thunderstorm','prescribed_burn']){
 await page.locator('[data-event="'+type+'"]').click();assert.equal(await page.locator('#cf-startH').count(),0);assert.equal(await page.locator('#cf-durationH').count(),0);
 assert.equal(await page.evaluate(()=>fireEyeCounterfactual.event.startH),0);assert.equal(await page.locator('#cf-motion-direction').count(),1);assert.equal(await page.locator('#cf-motion-speed').count(),1);
 await page.locator('#cf-motion-direction').evaluate(el=>{el.value='90';el.dispatchEvent(new Event('input'));});await page.locator('#cf-motion-speed').evaluate(el=>{el.value='24';el.dispatchEvent(new Event('input'));});
 assert.equal(await page.evaluate(()=>fireEyeCounterfactual.event.motion.speed),24);await page.waitForTimeout(750);
 const result=await page.evaluate(()=>({sources:!!fireEyePreview.map.getSource('cf-area-next'),base:fireEyePreview.map.getPaintProperty('cf-area-fill','raster-opacity'),next:fireEyePreview.map.getPaintProperty('cf-area-next-fill','raster-opacity')}));assert.ok(result.sources);assert.ok(result.base>=0&&result.base<=1);console.log(type,result);
}
// Standard lightning and rain glyphs follow the same Mercator translation as the area.
await page.evaluate(()=>{const e=fireEyeCounterfactual.defaults('thunderstorm',[-96,38]);e.rainIn=.4;e.dry=false;e.motion={direction:90,speed:24};e.area={width:32,height:32,bounds:[-108,30,-85,45],mask:Array.from({length:1024},(_,i)=>i%32>0&&i%32<31&&Math.floor(i/32)>0&&Math.floor(i/32)<31?1:0)};fireEyeCounterfactual.setEvent(e);});
await page.waitForTimeout(100);
const positions=()=>page.evaluate(()=>{const map=fireEyePreview.map,q=map.project(map.getSource('cf-area').serialize().coordinates[0]);return {raster:[q.x,q.y],symbols:['.cf-lightning-marker','.cf-rain-marker'].map(selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect();return {x:r.x,y:r.y,opacity:Number(el.style.opacity)};})};});
const before=await positions();await page.waitForTimeout(450);const after=await positions();const dx=after.raster[0]-before.raster[0],dy=after.raster[1]-before.raster[1];assert.ok(dx>1);
for(let i=0;i<2;i++){assert.ok(Math.abs(after.symbols[i].x-before.symbols[i].x-dx)<3);assert.ok(Math.abs(after.symbols[i].y-before.symbols[i].y-dy)<3);assert.ok(after.symbols[i].opacity<before.symbols[i].opacity);}
assert.ok(await page.locator('.cf-rain-marker[data-drops="2"]').count()>0);
await page.screenshot({path:'/tmp/cf-thunder-motion-refined.png'});
await page.screenshot({path:'/tmp/cf-motion-desktop.png'});
await page.locator('[data-event="high_wind"]').click();assert.equal(await page.locator('#cf-startH').count(),0);assert.equal(await page.locator('#cf-durationH').count(),0);
await page.evaluate(()=>fireEyeCounterfactual.close());assert.equal(await page.evaluate(()=>fireEyePreview.map.getStyle().layers.filter(l=>l.id.startsWith('cf-')).length),0);
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{fireEyeCounterfactual.open();fireEyeCounterfactual.setEvent(fireEyeCounterfactual.defaults('heavy_rain',[-96,38]));});await page.waitForTimeout(600);await page.screenshot({path:'/tmp/cf-motion-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log('motion browser PASS',base);await browser.close();

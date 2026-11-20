const {chromium}=await import(process.env.CF_PLAYWRIGHT_MODULE||'../../cf-app/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
const base=process.env.CF_URL||'http://127.0.0.1:5211',browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());await page.goto(base);await page.waitForFunction(()=>window.fireEyePreview?.ready&&window.FireMotion,null,{timeout:60000});await page.evaluate(()=>fireEyeCounterfactual.open());
 for(const type of ['heavy_rain','thunderstorm','prescribed_burn']){
  await page.locator(`[data-event="${type}"]`).click();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#cf-motion-direction').count(),0);assert.equal(await page.locator('#cf-motion-speed').count(),1);
  const snapshot=()=>page.evaluate(()=>{const s=fireEyePreview.map.getSource('cf-area'),c=s.getCanvas(),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let peak=0;for(let i=3;i<d.length;i+=4)if(d[i]>d[peak])peak=i-3;return {center:[...fireEyeCounterfactual.event.center],coordinates:s.coordinates,pixels:Array.from(d),peak,core:Array.from(d.slice(peak,peak+4)),camera:fireEyePreview.map.getCenter().toArray()};});
  const before=await snapshot();await page.waitForTimeout(850);const after=await snapshot();assert.deepEqual(after.center,before.center);assert.deepEqual(after.coordinates,before.coordinates);assert.deepEqual(after.camera,before.camera);
  assert.ok(after.pixels.length===before.pixels.length,'CanvasSource size remains unchanged');
  assert.ok(after.pixels.some((v,i)=>v!==before.pixels[i]),'seed texture changes with its phase');
  const extra=await page.evaluate(async()=>{const c=fireEyePreview.map.getSource('cf-area').getCanvas(),ctx=c.getContext('2d');await new Promise(r=>setTimeout(r,450));const d=ctx.getImageData(0,0,c.width,c.height).data;return Array.from(d);});
  assert.ok(extra.length===before.pixels.length,'CanvasSource keeps stable dimensions');
  assert.ok(extra.some((v,i)=>v!==after.pixels[i]),'contour region moves inside the same anchored CanvasSource');
  await page.locator('#cf-motion-speed').evaluate(el=>{el.value=0;el.dispatchEvent(new Event('input'));});await page.waitForTimeout(80);const still=await snapshot();await page.waitForTimeout(400);assert.deepEqual((await snapshot()).pixels,still.pixels);
  assert.equal(await page.evaluate(()=>fireEyePreview.map.getPaintProperty('cf-area-fill','raster-opacity')),1);
  await page.locator('[data-mode="expert"]').click();await page.locator('#cf-startH').fill('12');await page.locator('#cf-startH').dispatchEvent('change');assert.equal(await page.evaluate(()=>fireEyeCounterfactual.event.startH),12);await page.locator('[data-mode="everyone"]').click();
 }
 await page.locator('[data-event="thunderstorm"]').click();await page.keyboard.press('Escape');await page.locator('[data-preset="Scattered, wet"]').click();
 const positions=()=>page.locator('.cf-weather-marker').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return[r.x,r.y,el.style.opacity]}));const before=await positions();assert.ok(before.length>0);await page.waitForTimeout(750);assert.deepEqual(await positions(),before);
 await page.screenshot({path:'/tmp/cf-radar-stationary-dev.png'});await page.evaluate(()=>fireEyeCounterfactual.close());assert.equal(await page.evaluate(()=>fireEyePreview.map.getStyle().layers.filter(l=>l.id.startsWith('cf-')).length),0);assert.deepEqual(errors,[]);
 console.log('Stationary radar, fixed peak core, moving inner and outer regions, static symbols and cleanup PASS',base);
}finally{await browser.close();}

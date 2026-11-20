const {chromium}=await import(process.env.CF_PLAYWRIGHT_MODULE||'../../cf-app/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
const base=process.env.CF_URL||'http://127.0.0.1:5211',browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());await page.goto(base);await page.waitForFunction(()=>window.fireEyePreview?.ready&&window.FireMotion,null,{timeout:60000});await page.evaluate(()=>fireEyeCounterfactual.open());
 for(const type of ['heavy_rain','thunderstorm','prescribed_burn']){
  await page.locator(`[data-event="${type}"]`).click();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#cf-motion-direction').count(),0);assert.equal(await page.locator('#cf-motion-speed').count(),1);
  const snapshot=()=>page.evaluate(()=>{const s=fireEyePreview.map.getSource('cf-area'),c=s.getCanvas(),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,i=(Math.floor(c.height/2)*c.width+Math.floor(c.width/2))*4;return {center:[...fireEyeCounterfactual.event.center],coordinates:s.coordinates,pixels:Array.from(d),core:Array.from(d.slice(i,i+4)),camera:fireEyePreview.map.getCenter().toArray()};});
  const before=await snapshot();await page.waitForTimeout(850);const after=await snapshot();assert.deepEqual(after.center,before.center);assert.deepEqual(after.coordinates,before.coordinates);assert.deepEqual(after.core,before.core);assert.deepEqual(after.camera,before.camera);
  assert.ok(after.pixels.some((v,i)=>v!==before.pixels[i]),'outer edge texture changes');
  const changed=after.pixels.reduce((n,v,i)=>n+Number(v!==before.pixels[i]),0);assert.ok(changed<after.pixels.length*.12,'interior remains nearly static');
  await page.locator('#cf-motion-speed').evaluate(el=>{el.value=0;el.dispatchEvent(new Event('input'));});await page.waitForTimeout(80);const still=await snapshot();await page.waitForTimeout(400);assert.deepEqual((await snapshot()).pixels,still.pixels);
  assert.equal(await page.evaluate(()=>fireEyePreview.map.getPaintProperty('cf-area-fill','raster-opacity')),1);
  await page.locator('[data-mode="expert"]').click();await page.locator('#cf-startH').fill('12');await page.locator('#cf-startH').dispatchEvent('change');assert.equal(await page.evaluate(()=>fireEyeCounterfactual.event.startH),12);await page.locator('[data-mode="everyone"]').click();
 }
 await page.locator('[data-event="thunderstorm"]').click();await page.keyboard.press('Escape');await page.locator('[data-preset="Scattered, wet"]').click();
 const positions=()=>page.locator('.cf-weather-marker').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return[r.x,r.y,el.style.opacity]}));const before=await positions();assert.ok(before.length>0);await page.waitForTimeout(750);assert.deepEqual(await positions(),before);
 await page.screenshot({path:'/tmp/cf-radar-stationary-dev.png'});await page.evaluate(()=>fireEyeCounterfactual.close());assert.equal(await page.evaluate(()=>fireEyePreview.map.getStyle().layers.filter(l=>l.id.startsWith('cf-')).length),0);assert.deepEqual(errors,[]);
 console.log('Stationary radar, fixed interior RGBA, edge-only activity, static symbols and cleanup PASS',base);
}finally{await browser.close();}

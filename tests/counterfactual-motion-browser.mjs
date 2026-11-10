const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'../../cf-app/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
const base=process.env.CF_URL||'http://127.0.0.1:5201',browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());await page.goto(base);await page.waitForFunction(()=>window.fireEyePreview?.ready&&window.FireMotion,null,{timeout:60000});await page.evaluate(()=>fireEyeCounterfactual.open());
 for(const type of ['heavy_rain','thunderstorm','prescribed_burn']){
  await page.locator(`[data-event="${type}"]`).click();assert.equal(await page.locator('#cf-motion-direction').count(),0);assert.equal(await page.locator('#cf-startH').count(),0);assert.equal(await page.locator('#cf-durationH').count(),0);assert.equal(await page.locator('#cf-motion-speed').count(),1);
  assert.ok(await page.locator('#cf-fields').innerText().then(t=>t.includes('Cloud activity')));
  const snapshot=()=>page.evaluate(()=>({center:[...fireEyeCounterfactual.event.center],coordinates:fireEyePreview.map.getSource('cf-area').serialize().coordinates,url:fireEyePreview.map.getSource('cf-area').serialize().url,handle:fireEyePreview.map.getSource('cf-event')._data.features.find(f=>f.properties.kind==='handle').geometry.coordinates}));
  const before=await snapshot();await page.waitForTimeout(700);const after=await snapshot();assert.deepEqual(after.center,before.center);assert.deepEqual(after.coordinates,before.coordinates);assert.deepEqual(after.handle,before.handle);assert.notEqual(after.url,before.url);
  await page.locator('#cf-motion-speed').press('Home');await page.waitForTimeout(80);const still=await snapshot();await page.waitForTimeout(600);assert.equal((await snapshot()).url,still.url);assert.equal(await page.evaluate(()=>fireEyePreview.map.getPaintProperty('cf-area-fill','raster-opacity')),1);
  await page.locator('#cf-motion-speed').evaluate(el=>{el.value=30;el.dispatchEvent(new Event('input'));});
  await page.locator('[data-mode="expert"]').click();await page.locator('#cf-startH').fill('12');await page.locator('#cf-startH').dispatchEvent('change');assert.equal(await page.evaluate(()=>fireEyeCounterfactual.event.startH),12);await page.locator('[data-mode="everyone"]').click();
 }
 await page.locator('[data-event="thunderstorm"]').click();await page.locator('[data-preset="Scattered, wet"]').click();await page.locator('#cf-motion-speed').press('Home');await page.waitForTimeout(60);
 const positions=()=>page.locator('.cf-weather-marker').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return[r.x,r.y]}));const positionsBefore=await positions();assert.ok(positionsBefore.length>0);
 await page.locator('#cf-motion-speed').evaluate(el=>{el.value=30;el.dispatchEvent(new Event('input'));});await page.waitForTimeout(650);assert.deepEqual(await positions(),positionsBefore);await page.screenshot({path:'/tmp/cf-cloud-churn-desktop.png'});
 await page.evaluate(()=>fireEyeCounterfactual.close());assert.equal(await page.evaluate(()=>fireEyePreview.map.getStyle().layers.filter(l=>l.id.startsWith('cf-')).length),0);
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>fireEyeCounterfactual.open());await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'/tmp/cf-cloud-churn-mobile.png'});assert.deepEqual(errors,[]);console.log('fixed-centre contour churn, no direction, static zero, expert timing and cleanup PASS',base);
}finally{await browser.close();}

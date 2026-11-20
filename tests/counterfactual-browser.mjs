const {chromium}=await import(process.env.CF_PLAYWRIGHT_MODULE||'../../cf-app/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.CF_URL||'http://127.0.0.1:5199';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
await page.goto(base);
await page.waitForFunction(()=>window.fireEyePreview?.ready&&window.fireEyeCounterfactual,null,{timeout:60000});
await page.evaluate(()=>{fireEyePreview.setRiskDisplay(.7,true);return fireEyeCounterfactual.open();});
if(process.env.CF_RESEARCH_SAMPLE==='1')await page.waitForFunction(()=>fireEyeCounterfactual.researchContext,null,{timeout:30000});
await page.locator('[data-mode="expert"]').click();
await page.locator('#cf-windMph').fill('45');await page.locator('#cf-windMph').dispatchEvent('change');
assert.equal(await page.evaluate(()=>fireEyeCounterfactual.event.windMph),45);
await page.locator('[data-mode="everyone"]').click();
for(const type of ['high_wind','heavy_rain','thunderstorm','prescribed_burn','hurricane']){
 const result=await page.evaluate(async type=>{
  const api=fireEyeCounterfactual,e=api.defaults(type,[-120,38]);
  if(type==='thunderstorm')e.rainIn=0;
  if(type==='hurricane')e.track=Array.from({length:6},()=>[-120,38,100]);
  api.setEvent(e);const r=await api.run();
  return {type,status:api.state.status,available:r?.available,span:r?.scoreSpan,nativeUnit:r?.nativeUnit,unit:r?.unit,forcing:r?.forcing,
   discovery:!!r?.discovery,windows:r?.windows.map(w=>({lead:w.leadHours,time:w.targetTime,cells:w.summary.cells,baseline:w.summary.baseline,scenario:w.summary.scenario})),
   retained:!!r?.windows.every(w=>w.publishedBaseline.every((v,i)=>{const b=api.researchContext?.windows[0].values[i];return !api.researchContext||(Number.isNaN(v)&&Number.isNaN(b))||v===b;}))};
 },type);
 assert.ok(result.windows?.length,type+': '+result.status);assert.equal(result.retained,true);assert.equal(result.unit,'score');assert.equal(result.nativeUnit,'ISI');
 if(type==='prescribed_burn')assert.equal(result.available,false);
 else if(type==='thunderstorm'){assert.equal(result.span,0);assert.equal(result.discovery,true);}
 else {assert.equal(result.available,true);assert.ok(result.span>0,type+' has a native mechanism response');}
 if(process.env.CF_RESEARCH_SAMPLE==='1'){
  assert.equal(result.forcing,'snapshot-held');assert.equal(result.windows.length,1);assert.equal(result.windows[0].time,'2026-10-27T12:00:00Z');
 }
 await page.evaluate(()=>fireEyeCounterfactual.setView('published'));
 assert.ok(await page.locator('#cf-results').textContent().then(t=>t.includes('Retained published fire-activity')));
 results.push(result);
}
await page.evaluate(async()=>{
 const api=fireEyeCounterfactual;api.setEvent(api.defaults('heavy_rain',[-120,38]));
 const map=fireEyePreview.map;map.removeLayer('cf-result-fill');map.removeSource('cf-result');
 await api.run();if(!api.result?.available||!map.getSource('cf-result'))throw Error('Result source lifecycle recovery failed');
 api.setView('scenario');
});
const directory=process.env.CF_SCREENSHOT_DIR||'/tmp/fire-eye-research-browser';fs.mkdirSync(directory,{recursive:true});
await page.screenshot({path:directory+'/desktop.png'});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:directory+'/mobile.png'});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.evaluate(()=>fireEyeCounterfactual.close());
const closed=await page.evaluate(()=>({opacity:fireEyePreview.riskOpacity,layers:fireEyePreview.map.getStyle().layers.filter(l=>l.id.startsWith('cf-')).map(l=>l.id)}));
assert.equal(closed.opacity,.7);assert.equal(closed.layers.length,0);assert.deepEqual(errors,[]);
console.log(JSON.stringify({results,errors,closed,screenshots:directory},null,2));
await browser.close();

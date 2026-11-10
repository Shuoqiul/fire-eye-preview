import {chromium} from '../../cf-app/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const base=process.env.CF_URL||'http://127.0.0.1:5199';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});
await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
await page.goto(base);
await page.waitForFunction(()=>window.fireEyePreview?.ready && window.fireEyeCounterfactual,null,{timeout:60000});
await page.evaluate(()=>{fireEyePreview.setRiskDisplay(.7,true);return fireEyeCounterfactual.open()});
console.log('open',await page.evaluate(()=>fireEyeCounterfactual.state.open));
await page.locator('[data-mode="expert"]').click();
await page.locator('#cf-windMph').fill('45');
await page.locator('#cf-windMph').dispatchEvent('change');
assert.equal(await page.evaluate(()=>fireEyeCounterfactual.event.windMph),45);
await page.locator('[data-mode="everyone"]').click();
assert.equal(await page.evaluate(()=>fireEyeCounterfactual.event.windMph),45);

for(const type of ['high_wind','heavy_rain','thunderstorm','prescribed_burn','hurricane']) {
 const result=await page.evaluate(async type=>{const api=fireEyeCounterfactual,e=api.defaults(type,[-120,38]);if(type==='thunderstorm'){e.rainIn=0;e.dry=true;e.durationH=12;}api.setEvent(e);const r=await api.run();return {type,status:api.state.status,windows:r?.windows.map(w=>({lead:w.leadHours,delta:w.summary.delta,cells:w.summary.cells})),features:fireEyePreview.map.getSource('cf-result')?._data?.features.length,span:r?.span};},type);
 console.log(JSON.stringify(result));
 assert.ok(result.span>0,type+' has an effect on real cells');
 if(!result.windows?.length)throw Error('run failed '+type+': '+result.status);
 if(type==='prescribed_burn'){
  assert.ok(await page.evaluate(()=>fireEyeCounterfactual.result.windows.every(w=>w.delta.every(d=>!Number.isFinite(d)||d<=0))));
  assert.equal(await page.evaluate(()=>fireEyePreview.riskVisible),false);
  assert.equal(await page.evaluate(()=>fireEyePreview.map.getLayoutProperty('cf-area-fill','visibility')),'none');
  await page.evaluate(()=>fireEyeCounterfactual.setView('baseline'));assert.equal(await page.evaluate(()=>fireEyePreview.map.getLayoutProperty('cf-area-fill','visibility')),'visible');
  await page.evaluate(()=>fireEyeCounterfactual.setView('change'));
 }
 if(type==='high_wind'){
  await page.evaluate(()=>fireEyeCounterfactual.setView('scenario'));
  await page.waitForTimeout(500);
  await page.screenshot({path:'/tmp/counterfactual-desktop.png'});
  await page.evaluate(()=>fireEyeCounterfactual.setView('change'));
 }
}
await page.evaluate(async()=>{await fireEyeCounterfactual.run();if(!fireEyeCounterfactual.result)throw Error('Repeat run missing result');const e=structuredClone(fireEyeCounterfactual.event);fireEyeCounterfactual.setEvent({...e,radiusKm:e.radiusKm+10});if(fireEyeCounterfactual.result)throw Error('Edited parameters retained result');await fireEyeCounterfactual.run();await fireEyeCounterfactual.setWindow(3);fireEyeCounterfactual.setView('baseline');fireEyeCounterfactual.close()});
const closed=await page.evaluate(()=>({opacity:fireEyePreview.riskOpacity,layers:fireEyePreview.map.getStyle().layers.filter(l=>l.id.startsWith('cf-')).map(l=>l.id)}));console.log('closed',closed);assert.equal(closed.opacity,.7);assert.equal(closed.layers.length,0);
await page.evaluate(async()=>{
 await fireEyeCounterfactual.open();
 const s=fireEyePreview,load=s.gridFor;
 s.gridFor=async()=>{throw Error('Numeric fixture unavailable')};
 await fireEyeCounterfactual.run();
 if(fireEyeCounterfactual.result || !fireEyeCounterfactual.state.status.includes('unavailable'))throw Error('Missing data not handled');
 s.gridFor=load;
 const manifest=s.manifest;
 s.manifest={...manifest,release_id:'test-release'};
 window.dispatchEvent(new Event('fire-eye:forecast-changed'));
 if(fireEyeCounterfactual.result)throw Error('Release change retained stale result');
 s.manifest=manifest;
 fireEyeCounterfactual.close();
});
await page.setViewportSize({width:390,height:844});
await page.evaluate(()=>fireEyeCounterfactual.open());
await page.waitForTimeout(300);
await page.screenshot({path:'/tmp/counterfactual-mobile.png'});
console.log('mobile',await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,panel:document.getElementById('cf-panel').getBoundingClientRect().toJSON()})));
console.log('errors',JSON.stringify(errors));
if(errors.length)throw Error('Page errors');
await browser.close();

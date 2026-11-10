const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'../../cf-app/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
const base=process.env.CF_URL||'http://127.0.0.1:5199',browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});
const preset=name=>page.locator(`.cf-preset[data-preset="${name}"]`);
const choose=type=>page.locator(`[data-event="${type}"]`).click();
try {
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 await page.goto(base);await page.waitForFunction(()=>window.fireEyePreview?.ready&&window.FirePresets,null,{timeout:60000});await page.evaluate(()=>fireEyeCounterfactual.open());
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const [type,count] of [['hurricane',5],['thunderstorm',6],['heavy_rain',5],['high_wind',4],['prescribed_burn',3]]){
  await choose(type);assert.equal(await page.locator('.cf-preset').count(),count);assert.equal(await page.locator('.cf-preset[aria-pressed="true"]').count(),1);
  assert.equal(await page.locator('#cf-fields input[type="number"]').count(),0);assert.equal(await page.locator('.cf-track-editor').count(),0);
  assert.deepEqual(await page.evaluate(()=>[fireEyeCounterfactual.event.startH,fireEyeCounterfactual.event.durationH]),[0,24]);
  if(type==='hurricane')assert.equal(await page.locator('.cf-preset[aria-pressed="true"]').getAttribute('data-preset'),'Hurricane');
  if(type==='thunderstorm')assert.equal(await page.locator('.cf-preset[aria-pressed="true"]').getAttribute('data-preset'),'Scattered, dry');
  await page.locator('[data-mode="expert"]').click();assert.equal(await page.locator('#cf-startH').count(),1);assert.equal(await page.locator('#cf-durationH').count(),1);
  await page.locator('#cf-startH').fill('12');await page.locator('#cf-startH').dispatchEvent('change');await page.locator('#cf-durationH').fill('36');await page.locator('#cf-durationH').dispatchEvent('change');
  assert.deepEqual(await page.evaluate(()=>[fireEyeCounterfactual.event.startH,fireEyeCounterfactual.event.durationH]),[12,36]);
  if(type==='hurricane'){assert.equal(await page.locator('#cf-radiusKm').count(),0);assert.equal(await page.locator('.cf-track-editor table tr').count(),7);}
  await page.locator('[data-mode="everyone"]').click();assert.deepEqual(await page.evaluate(()=>[fireEyeCounterfactual.event.startH,fireEyeCounterfactual.event.durationH]),[0,24]);
 }
 await choose('hurricane');
 const shadowSpan=()=>page.evaluate(()=>{const geometry=fireEyePreview.map.getSource('cf-event')._data.features.find(f=>f.properties.kind==='shadow').geometry,points=geometry.coordinates.flat(2);return Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]));});
 await preset('Tropical storm').click();const narrow=await shadowSpan();await preset('Super typhoon').click();assert.ok(await shadowSpan()>narrow);assert.ok(await page.evaluate(()=>fireEyeCounterfactual.event.track.every((p,i,t)=>!i||p[2]<t[i-1][2])));
 await page.screenshot({path:'/tmp/cf-hurricane-presets.png'});
 await choose('high_wind');await page.evaluate(()=>fireEyePreview.map.jumpTo({center:[-98,35],zoom:5}));await page.evaluate(()=>{const e=fireEyeCounterfactual.event;fireEyeCounterfactual.setEvent({...e,windPath:[[-110,35],[-88,35]]});});
 await preset('Windy').click();const low=await page.evaluate(()=>fireEyeCounterfactual.visuals.windArrows);await preset('Damaging').click();const high=await page.evaluate(()=>fireEyeCounterfactual.visuals.windArrows);assert.ok(low>high,`low/high arrow counts ${low}/${high}`);
 const path=await page.evaluate(()=>structuredClone(fireEyeCounterfactual.event.windPath));
 const span=()=>page.evaluate(()=>{const map=fireEyePreview.map,ys=fireEyeCounterfactual.visuals.windVectors.map(a=>(map.project(a.from).y+map.project(a.to).y)/2);return Math.max(...ys)-Math.min(...ys);});
 const centreStations=()=>page.evaluate(()=>{const map=fireEyePreview.map,y=map.project(fireEyeCounterfactual.event.windPath[0]).y;return fireEyeCounterfactual.visuals.windVectors.filter(a=>Math.abs((map.project(a.from).y+map.project(a.to).y)/2-y)<.01).map(a=>a.from[0]);});
 await page.locator('#cf-radiusKm').press('Home');const thin=await span(),stations=await centreStations();await page.locator('#cf-radiusKm').press('End');assert.ok(await span()>thin+5);assert.deepEqual(await centreStations(),stations);assert.deepEqual(await page.evaluate(()=>fireEyeCounterfactual.event.windPath),path);
 await page.locator('[data-mode="expert"]').click();assert.equal(await page.locator('#cf-radiusKm').inputValue(),'200');assert.equal(await page.locator('#cf-windMph').inputValue(),'58');await page.locator('[data-mode="everyone"]').click();
 await page.evaluate(()=>fireEyeCounterfactual.setEvent({...fireEyeCounterfactual.event,windPath:[[-108,35],[-92,35],[-103,38],[-92,41]]}));assert.ok(await page.evaluate(()=>fireEyeCounterfactual.visuals.windVectors.some(v=>v.contributors>1)));
 assert.equal(await page.evaluate(()=>fireEyePreview.map.getSource('cf-event')._data.features.filter(f=>f.properties.kind==='wind-guide').length),0);await page.screenshot({path:'/tmp/cf-adaptive-wind.png'});
 await page.evaluate(()=>fireEyePreview.map.jumpTo({center:[-98,38],zoom:3.2}));
 const setup=type=>page.evaluate(type=>{const a=fireEyeCounterfactual,e=a.defaults(type,[-96,38]);e.area={width:32,height:32,bounds:[-108,30,-85,45],mask:Array.from({length:1024},(_,i)=>i%32>0&&i%32<31&&Math.floor(i/32)>0&&Math.floor(i/32)<31?1:0)};a.setEvent(e);},type);
 const ink=()=>page.evaluate(async()=>{await new Promise(r=>setTimeout(r,50));const url=fireEyePreview.map.getSource('cf-area').serialize().url,img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const a=ctx.getImageData(0,0,c.width,c.height).data;let sum=0;for(let i=0;i<a.length;i+=4)sum+=a[i+3]*(765-a[i]-a[i+1]-a[i+2]);return sum;});
 await setup('heavy_rain');await preset('0.2 in').click();const light=await ink();await preset('1.0 in').click();assert.ok(await ink()>light*1.5);
 await setup('prescribed_burn');await preset('Light treatment').click();const small=await ink();await preset('Recent treatment').click();assert.ok(await ink()>small);
 await setup('thunderstorm');await preset('Isolated, dry').click();const isolated=await ink();await preset('Scattered, dry').click();assert.ok(await ink()>isolated);await preset('Scattered, wet').click();
 const visuals=await page.evaluate(()=>fireEyeCounterfactual.visuals);assert.ok(visuals.lightning>4);assert.ok(visuals.rain.length>0);assert.ok(visuals.rain.every(s=>s.drops===2&&s.corners>=3));assert.equal(await page.locator('.cf-rain-marker [data-drop]').count(),visuals.rain.length*2);
 assert.equal(await page.locator('.cf-weather-marker').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');await page.screenshot({path:'/tmp/cf-thunder-presets.png'});
 await preset('Scattered, dry').click();assert.equal(await page.locator('.cf-rain-marker').count(),0);
 await choose('hurricane');assert.equal(await page.locator('.cf-cyclone-marker svg').count(),6);
 await page.evaluate(()=>fireEyeCounterfactual.close());assert.equal(await page.locator('.cf-weather-marker').count(),0);assert.equal(await page.locator('.cf-cyclone-marker').count(),0);assert.deepEqual(errors,[]);
 console.log('public recipes, expert timing, coastline envelope, adaptive wind and rain lattice PASS',base);
} finally { await browser.close(); }

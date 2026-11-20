const {chromium}=await import(process.env.CF_PLAYWRIGHT_MODULE||'../../cf-app/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.CF_URL||'http://127.0.0.1:5199',browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 await page.goto(base);await page.waitForFunction(()=>window.fireEyePreview?.ready&&window.fireEyeCounterfactual,null,{timeout:60000});await page.evaluate(()=>fireEyeCounterfactual.open());
 for(const type of ['hurricane','high_wind','heavy_rain','thunderstorm','prescribed_burn']){
  await page.locator(`[data-event="${type}"]`).click();assert.equal(await page.locator('.cf-brush-canvas').count(),1);assert.equal(await page.locator('.cf-brush-tools').count(),1);
  assert.equal(await page.evaluate(()=>fireEyeCounterfactual.visuals.brushActive),true);
  assert.match(await page.locator('.cf-brush-canvas').getAttribute('aria-label'),['hurricane','high_wind'].includes(type)?/path/:/area/);
 }
 await page.keyboard.press('Escape');assert.equal(await page.locator('.cf-brush-canvas').count(),0);
 const draw=page.locator('#cf-draw-event');await draw.scrollIntoViewIfNeeded();assert.equal(await draw.locator('svg').count(),1);
 const positions=await draw.evaluate(el=>{const a=el.querySelector('svg').getBoundingClientRect(),b=el.querySelector('strong').getBoundingClientRect();return[a.bottom,b.top,el.getBoundingClientRect().height]});assert.ok(positions[0]<=positions[1]);assert.ok(positions[2]>=100);
 await draw.click();assert.equal(await page.locator('.cf-brush-canvas').count(),1);await page.keyboard.press('Escape');
 // A fresh selection starts one stroke and confirm keeps its coordinates.
 await page.locator('[data-event="high_wind"]').click();await page.mouse.move(760,640);await page.mouse.down();for(const p of [[840,600],[930,440],[1050,460],[950,570],[1100,610]])await page.mouse.move(...p,{steps:10});await page.mouse.up();
 await page.getByRole('button',{name:'Confirm',exact:true}).click();assert.equal(await page.locator('.cf-brush-canvas').count(),0);
 assert.ok(await page.evaluate(()=>fireEyeCounterfactual.event.windPath.length>=6));await page.waitForTimeout(300);
 const directory=process.env.CF_SCREENSHOT_DIR||'/tmp/cf-radar-acceptance';fs.mkdirSync(directory,{recursive:true});await page.screenshot({path:directory+'/wind-desktop.png'});
 await page.evaluate(()=>fireEyePreview.map.jumpTo({center:[-98,38],zoom:6}));
 await page.locator('[data-event="high_wind"]').click();
 await page.mouse.move(760,610);await page.mouse.down();for(const p of [[820,611],[880,609],[940,612],[1000,609],[1060,611],[1120,610]])await page.mouse.move(...p,{steps:8});await page.mouse.up();
 await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await page.locator('#cf-radiusKm').evaluate(el=>{el.value=200;el.dispatchEvent(new Event('input'));});
 const straight=await page.evaluate(()=>{const project=p=>fireEyePreview.map.project(p),arrows=fireEyeCounterfactual.visuals.windVectors.map(v=>v.points.map(project));return {width:fireEyeCounterfactual.event.radiusKm*2,span:Math.max(...arrows.map(a=>a[0].y))-Math.min(...arrows.map(a=>a[0].y)),aligned:arrows.every(a=>a.at(-1).x>a[0].x&&a.every(p=>Math.abs(p.y-a[0].y)<.1))};});
 assert.equal(straight.width,200);assert.ok(straight.span>72,'wide corridor retains outer lanes');assert.ok(straight.aligned,'wide outer arrows follow the drawn heading');
 await page.screenshot({path:directory+'/wind-straight-wide.png'});
 await page.locator('[data-event="heavy_rain"]').click();await page.mouse.move(820,600);await page.mouse.down();await page.mouse.move(1050,660,{steps:15});await page.mouse.move(1010,760,{steps:10});await page.mouse.up();await page.getByRole('button',{name:'Confirm',exact:true}).click();
 assert.ok(await page.evaluate(()=>fireEyeCounterfactual.event.area.mask.some(Boolean)));
 await page.screenshot({path:directory+'/area-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('[data-event="thunderstorm"]').click();assert.equal(await page.locator('.cf-brush-canvas').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:directory+'/draw-mobile.png'});
 await page.keyboard.press('Escape');await page.evaluate(()=>fireEyeCounterfactual.close());assert.equal(await page.evaluate(()=>fireEyePreview.map.getStyle().layers.filter(l=>l.id.startsWith('cf-')).length),0);assert.deepEqual(errors,[]);console.log('Event auto-draw, primary icon, confirm, mobile and cleanup PASS',base);
}finally{await browser.close();}

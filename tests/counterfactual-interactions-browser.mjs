const {chromium}=await import(process.env.CF_PLAYWRIGHT_MODULE||'../../cf-app/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.CF_URL||'http://127.0.0.1:5199',browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 await page.goto(base);await page.waitForFunction(()=>window.fireEyePreview?.ready&&window.fireEyeCounterfactual,null,{timeout:60000});await page.evaluate(()=>fireEyeCounterfactual.open());
 for(const type of ['hurricane','high_wind','heavy_rain','thunderstorm','prescribed_burn']){
  await page.locator(`[data-event="${type}"]`).click();assert.equal(await page.locator('.cf-brush-canvas').count(),1);assert.equal(await page.locator('.cf-brush-tools').count(),1);assert.equal(await page.locator('#cf-run').isVisible(),true);
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
 const zoomDensity=await page.evaluate(()=>{const view=[0,0,1440,960],f=FireDrawing.windField([[40,760],[350,650],[580,260],[810,150]],350,undefined,58,view,{},8);return{count:f.length,average:f.reduce((n,a)=>n+a.glyphLength,0)/f.length,lanes:new Set(f.map(a=>a.lane)).size};});
 assert.ok(zoomDensity.count>=100&&zoomDensity.average>=35&&zoomDensity.average<58&&zoomDensity.lanes>12,'same viewport zoom keeps legible glyphs and lateral coverage: '+JSON.stringify(zoomDensity));
 const turn=await page.evaluate(()=>{const guide=FireDrawing.sample([[100,760],[520,650],[760,260],[980,150]],96),f=FireDrawing.windField(guide,300,undefined,45,[0,0,1440,960],{},7);return f.filter(a=>a.lane===0).sort((a,b)=>a.station-b.station).map(a=>Math.round(Math.atan2(a.to[1]-a.from[1],a.to[0]-a.from[0])*180/Math.PI));});
 assert.ok(turn.length>8&&new Set(turn).size>=6,'SW-W-NW field has intermediate headings: '+turn.join(','));
 const straight=await page.evaluate(()=>{const project=p=>fireEyePreview.map.project(p),arrows=fireEyeCounterfactual.visuals.windVectors.map(v=>v.points.map(project)),heading=a=>Math.atan2(a.at(-1).y-a[0].y,a.at(-1).x-a[0].x),guide=heading(fireEyeCounterfactual.event.windPath.map(project));return {width:fireEyeCounterfactual.event.radiusKm*2,span:Math.max(...arrows.map(a=>a[0].y))-Math.min(...arrows.map(a=>a[0].y)),aligned:arrows.every(a=>a.at(-1).x>a[0].x&&Math.abs(heading(a)-guide)<.035)};});
 assert.equal(straight.width,200);assert.ok(straight.span>72,'wide corridor retains outer lanes');assert.ok(straight.aligned,'wide outer arrows follow the drawn heading');
 await page.screenshot({path:directory+'/wind-straight-wide.png'});
 await draw.click();
 await page.mouse.move(773,755);await page.mouse.down();for(const p of [[970,460],[1130,670]])await page.mouse.move(...p,{steps:18});await page.mouse.up();
 await page.getByRole('button',{name:'Confirm',exact:true}).click();
 const bend=await page.evaluate(()=>{
  const project=p=>fireEyePreview.map.project(p),arrows=fireEyeCounterfactual.visuals.windVectors.map(v=>v.points.map(project));
  let maxKink=0;
  for(const points of arrows){let last=null;for(let i=1;i<points.length;i++){
   const u=[points[i].x-points[i-1].x,points[i].y-points[i-1].y];if(Math.hypot(...u)<.25)continue;
   if(last)maxKink=Math.max(maxKink,Math.abs(Math.atan2(last[0]*u[1]-last[1]*u[0],last[0]*u[0]+last[1]*u[1])));
   last=u;
  }}
  return {count:arrows.length,maxKink};
 });
 assert.ok(bend.count>20&&bend.maxKink<Math.PI/6,`wide acute bend stays smooth; largest segment kink: ${bend.maxKink} rad`);
 const visible=await page.evaluate(async()=>{
  const ctx=document.getElementById('cf-wind-animation').getContext('2d'),styles=new Set(),counts=new Set();
  const begin=ctx.beginPath,move=ctx.moveTo,stroke=ctx.stroke;let arrows=0,headless=0,subpaths=0,calls=0;
  ctx.beginPath=function(){subpaths=0;return begin.call(this);};
  ctx.moveTo=function(...args){subpaths++;return move.apply(this,args);};
  ctx.stroke=function(){styles.add(`${this.strokeStyle}|${this.globalAlpha}|${this.lineWidth}`);arrows++;calls++;if(subpaths!==2)headless++;return stroke.call(this);};
  try{for(let i=0;i<45;i++){await new Promise(requestAnimationFrame);counts.add(calls);calls=0;}}
  finally{ctx.beginPath=begin;ctx.moveTo=move;ctx.stroke=stroke;}
  return {styles:[...styles],counts:[...counts],arrows,headless};
 });
 assert.ok(visible.arrows>45&&visible.counts.length>1,'staggered wind glyphs keep moving on a wide bend');
 assert.equal(visible.headless,0,'each drawn shaft carries its arrowhead');
 assert.equal(visible.styles.length,1,'all animated lanes use the same color, opacity and stroke');assert.ok(Number(visible.styles[0].split('|')[2])<1.5,'natural fine streamlets use a restrained stroke');
 await page.screenshot({path:directory+'/wind-acute-bend.png'});
 await page.evaluate(()=>fireEyePreview.map.jumpTo({center:[-83.6,32.5],zoom:7}));
 await page.locator('[data-preset="Damaging"]').click();await draw.click();
 await page.mouse.move(770,370);await page.mouse.down();for(const p of [[940,537],[1005,625],[1060,525],[1150,290]])await page.mouse.move(...p,{steps:16});await page.mouse.up();
 await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await page.emulateMedia({reducedMotion:'reduce'});
 const clearance=await page.evaluate(async()=>{
  const ctx=document.getElementById('cf-wind-animation').getContext('2d');
  const {beginPath,moveTo,lineTo,stroke}=ctx,arrows=[];let points,last;
  ctx.beginPath=function(){points=[];return beginPath.call(this);};
  ctx.moveTo=function(x,y){last=[x,y];points.push(last);return moveTo.call(this,x,y);};
  ctx.lineTo=function(x,y){
   const n=Math.max(1,Math.ceil(Math.hypot(x-last[0],y-last[1])*2));
   for(let i=1;i<=n;i++)points.push([last[0]+(x-last[0])*i/n,last[1]+(y-last[1])*i/n]);
   last=[x,y];return lineTo.call(this,x,y);
  };
  ctx.stroke=function(){arrows.push(points);return stroke.call(this);};
  try{await new Promise(requestAnimationFrame);}finally{Object.assign(ctx,{beginPath,moveTo,lineTo,stroke});}
  const bins=new Map();let min=8;
  arrows.forEach((arrow,id)=>arrow.forEach(([x,y])=>{
   const ix=Math.floor(x/8),iy=Math.floor(y/8);
   for(let i=ix-1;i<=ix+1;i++)for(let j=iy-1;j<=iy+1;j++)for(const [u,v,k] of bins.get(i+','+j)||[]){
    if(k!==id)min=Math.min(min,Math.hypot(x-u,y-v));
   }
   const key=ix+','+iy;if(!bins.has(key))bins.set(key,[]);bins.get(key).push([x,y,id]);
  }));
  return {min,count:arrows.length};
 });
 assert.ok(clearance.count>20&&clearance.min>1.7,`full arrowheads and shafts have room at the crowded bend: ${JSON.stringify(clearance)}`); console.log(`Tight bend: ${clearance.count} complete arrows, closest strokes ${clearance.min.toFixed(2)} CSS px apart`);
 await page.screenshot({path:directory+'/wind-bend-clearance.png'});
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('[data-event="heavy_rain"]').click();await page.mouse.move(820,600);await page.mouse.down();await page.mouse.move(1050,660,{steps:15});await page.mouse.move(1010,760,{steps:10});await page.mouse.up();await page.getByRole('button',{name:'Confirm',exact:true}).click();
 assert.ok(await page.evaluate(()=>fireEyeCounterfactual.event.area.mask.some(Boolean)));
 await page.screenshot({path:directory+'/area-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('[data-event="thunderstorm"]').click();assert.equal(await page.locator('.cf-brush-canvas').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:directory+'/draw-mobile.png'});
 await page.keyboard.press('Escape');await page.evaluate(()=>fireEyeCounterfactual.close());assert.equal(await page.evaluate(()=>fireEyePreview.map.getStyle().layers.filter(l=>l.id.startsWith('cf-')).length),0);assert.deepEqual(errors,[]);console.log('Event auto-draw, primary icon, confirm, mobile and cleanup PASS',base);
}finally{await browser.close();}

const {chromium}=await import(process.env.CF_PLAYWRIGHT_MODULE||'../../cf-app/node_modules/playwright/index.mjs');
import assert from 'node:assert/strict';
const base=process.env.CF_URL||'http://127.0.0.1:5211',browser=await chromium.launch({headless:true,...(process.env.CF_CHROMIUM?{executablePath:process.env.CF_CHROMIUM}:{})}),page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 await page.goto(base);await page.waitForFunction(()=>window.fireEyePreview?.ready,null,{timeout:60000});
 await page.evaluate(()=>fireEyeCounterfactual.open());
 await page.locator('[data-event="heavy_rain"]').click();
 await page.mouse.move(900,540);await page.mouse.down();await page.mouse.move(1030,540,{steps:12});await page.mouse.up();
 const previous=await page.evaluate(()=>fireEyePreview.map.getZoom());
 await page.mouse.move(1020,560);await page.mouse.wheel(0,-350);
 await page.waitForFunction(z=>fireEyePreview.map.getZoom()>z+.1,previous);
 await page.waitForFunction(()=>!fireEyePreview.map.isMoving());
 const paintedSample=await page.evaluate(()=>fireEyePreview.map.unproject([950-24,540-74]).toArray());
 await page.getByRole('button',{name:'Confirm',exact:true}).click();
 const painted=await page.evaluate(worldPoint=>{
  const map=fireEyePreview.map,area=fireEyeCounterfactual.event.area,b=area.bounds,center=[(b[0]+b[2])/2,(b[1]+b[3])/2],point=map.project(worldPoint),source=map.getSource('cf-area'),canvas=source.getCanvas(),width=canvas.width,height=canvas.height,merc=lat=>(1-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/Math.PI)/2,x=(worldPoint[0]-b[0])/(b[2]-b[0])*width,y=(merc(worldPoint[1])-merc(b[3]))/(merc(b[1])-merc(b[3]))*height,rgba=canvas.getContext('2d').getImageData(Math.min(width-1,Math.floor(x)),Math.min(height-1,Math.floor(y)),1,1).data;
  return {area:FireCounterfactual.areaAt(area,center),sample:FireCounterfactual.areaAt(area,worldPoint),alpha:rgba[3],zoom:map.getZoom(),point:[point.x,point.y],inside:point.x>0&&point.x<map.getContainer().clientWidth&&point.y>0&&point.y<map.getContainer().clientHeight};
 },paintedSample);
 assert.ok(painted.area>.1&&painted.sample>.1&&painted.alpha>0&&painted.inside,'confirmed painted area keeps its fixed geographic sample and visible pixels after wheel zoom');
 assert.equal(await page.getByRole('button',{name:'Run scenario',exact:true}).count(),1);
 const response=await page.evaluate(async()=>{const api=fireEyeCounterfactual;const result=await api.run();return {available:result?.available,span:result?.span,state:api.state.status,view:api.state.view,base:fireEyePreview.riskVisible};});
 assert.ok(response.available&&response.span>0,response.state);
 assert.equal(response.view,'scenario');assert.equal(response.base,true);
 assert.equal(await page.getByRole('button',{name:'Scenario',exact:true}).getAttribute('aria-pressed'),'true');
 const native=async()=>page.evaluate(()=>{
  const map=fireEyePreview.map;
  const features=map.getSource('cf-result')._data.features;
  return {raster:!!map.getSource('cf-result-image'),opacity:map.getPaintProperty('cf-result-fill','fill-opacity'),
   antialias:map.getPaintProperty('cf-result-fill','fill-antialias'),count:features.length,nativeMode:fireEyePreview.nativeRiskOnly,
   changedOnly:features.every(f=>f.properties.delta!==0),fiveKm:features.slice(0,20).every(({geometry})=>{
    const pr=proj4('EPSG:4326',fireEyePreview.active.run.overview.grid.proj4),[a,b,,d]=geometry.coordinates[0].map(p=>pr.forward(p));
    return Math.abs(Math.hypot(b[0]-a[0],b[1]-a[1])-5000)<.05&&Math.abs(Math.hypot(d[0]-a[0],d[1]-a[1])-5000)<.05;
   })};
 });
 const cells=await native();assert.ok(cells.count>0&&cells.fiveKm&&cells.changedOnly&&cells.nativeMode,JSON.stringify(cells));
 assert.deepEqual([cells.raster,cells.antialias],[false,false]);
 assert.deepEqual(cells.opacity.slice(0,2),['*',1]);assert.ok(cells.opacity[2][4]<.2);
 await page.screenshot({path:'/tmp/cf-native-5km.png'});
 await page.getByRole('button',{name:'Compare',exact:true}).click();
 const image=await page.evaluate(()=>fireEyePreview.map.getSource('cf-result-image').serialize().url);
 const imageData=Buffer.from(image.split(',')[1],'base64');
 const surface=await page.evaluate(async(url)=>{
  const map=fireEyePreview.map,img=new Image();img.src=url;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
  const rgba=ctx.getImageData(0,0,img.width,img.height).data,levels=new Set();for(let i=3;i<rgba.length;i+=4)levels.add(rgba[i]);
  const outside=FireCounterfactual.areaAt(fireEyeCounterfactual.event.area,[-130,38]);
  return {width:canvas.width,height:canvas.height,min:Math.min(...levels),max:Math.max(...levels),levels:levels.size,visibility:map.getLayoutProperty('cf-result-raster','visibility'),outside,outsideView:document.querySelector('#cf-results').textContent.includes('Feathering is visual only')};
 },image);
 assert.ok(imageData.length>0);assert.equal(surface.visibility,'visible');assert.ok(surface.min===0&&surface.max>40&&surface.max<180&&surface.levels>12,JSON.stringify(surface));
 assert.equal(surface.outside,0);assert.equal(surface.outsideView,true,'compare legend separates feathering from exact native differences');
 const compareLegend=await page.locator('.cf-legend').evaluate(el=>({text:el.textContent,ticks:[...el.querySelectorAll('.cf-legend-ticks span')].map(n=>n.textContent),bar:getComputedStyle(el.querySelector('.cf-legend-bar')).backgroundImage}));
 assert.match(compareLegend.text,/fixed scale/i);assert.deepEqual(compareLegend.ticks,['-0.1000','0.0000','+0.1000']);assert.match(compareLegend.bar,/249, 220, 220/);
 await page.getByRole('button',{name:'Scenario',exact:true}).click();
 const scenarioLegend=await page.locator('.cf-legend-bar').evaluate(el=>({styles:[...getComputedStyle(el).backgroundImage.matchAll(/\b\d{1,3},\s*\d{1,3},\s*\d{1,3}\b/g)].map(m=>m[0].replace(/\s+/g,'')),outside:el.parentElement.textContent.includes('Outside the event footprint: exact published values'),riskVisible:fireEyePreview.riskVisible}));assert.deepEqual(scenarioLegend.styles,['37,87,43','47,113,54','111,150,65','183,187,62','224,180,51','221,112,45','169,47,43']);assert.equal(scenarioLegend.outside,true);assert.equal(scenarioLegend.riskVisible,true);
 await page.screenshot({path:'/tmp/cf-scenario-feathered.png'});
 await page.locator('[data-event="thunderstorm"]').click();await page.keyboard.press('Escape');
 assert.ok(await page.locator('.cf-lightning-marker').count()>0);
 await page.locator('#cf-run').click();
 await page.waitForFunction(()=>fireEyeCounterfactual.result?.scoreSpan>0);
 const dry=await page.evaluate(()=>{
  const api=fireEyeCounterfactual,r=api.result,i=api.state.windowIndex,s=r.score;
  return {rain:api.event.rainIn,up:s.delta[i].some(d=>d>0),down:s.delta[i].some(d=>d<0),
   markers:[...document.querySelectorAll('.cf-weather-marker')].filter(m=>getComputedStyle(m).visibility==='visible').length};
 });
 assert.deepEqual(dry,{rain:0,up:true,down:false,markers:0});
 const thunder=await native();assert.ok(thunder.count>0&&thunder.fiveKm&&!thunder.raster);
 await page.getByRole('button',{name:'Compare',exact:true}).click();
 assert.equal(await page.evaluate(()=>fireEyePreview.map.getLayoutProperty('cf-result-raster','visibility')),'visible');
 assert.equal(await page.locator('.cf-weather-marker:visible').count(),0);
 await page.screenshot({path:'/tmp/cf-thunder-compare.png'});
 await page.locator('[data-event="prescribed_burn"]').click();await page.keyboard.press('Escape');
 await page.locator('#cf-run').click();
 await page.waitForFunction(()=>fireEyeCounterfactual.result?.treatmentStatus==='illustrative');
 assert.ok((await native()).count>0);
 assert.match(await page.locator('#cf-treatment-method').textContent(),/For calibration/);
 await page.screenshot({path:'/tmp/cf-burn-scenario.png'});
 await page.getByRole('button',{name:'Baseline',exact:true}).click();
 assert.equal(await page.locator('#cf-treatment-method').count(),0);
 assert.match(await page.locator('#cf-results').textContent(),/Released fire-activity score/);
 assert.equal(await page.evaluate(()=>fireEyePreview.map.getLayoutProperty('cf-result-fill','visibility')),'none');
 await page.getByRole('button',{name:'Compare',exact:true}).click();
 assert.ok(await page.evaluate(()=>fireEyeCounterfactual.result.score.delta[fireEyeCounterfactual.state.windowIndex].some(d=>d<0)));
 assert.equal(await page.evaluate(()=>fireEyePreview.map.getLayoutProperty('cf-result-raster','visibility')),'visible');
 await page.evaluate(()=>{const api=fireEyeCounterfactual,e=api.defaults('hurricane');e.track=[[-76,32,70],[-78,33,69],[-82,35,68],[-85,36,67],[-89,37,66],[-96,38,65]];e.center=e.track[0].slice(0,2);api.setEvent(e);});
 const cyclone=await page.evaluate(()=>({speeds:fireEyeCounterfactual.event.track.map(p=>p[2]),markers:[...document.querySelectorAll('.cf-cyclone-marker')].map(p=>[p.title,p.style.color]),radius:FirePresets.shadowRadius(0)}));assert.ok(cyclone.radius===2&&cyclone.markers.some(([title,color])=>title.includes('Dissipated')&&color==='rgb(122, 125, 128)'));
 assert.equal(await page.locator('#cf-run').isVisible(),true);await page.evaluate(()=>fireEyeCounterfactual.close());assert.equal(await page.evaluate(()=>fireEyePreview.map.getStyle().layers.filter(x=>x.id.startsWith('cf-')).length),0);assert.deepEqual(errors,[]);console.log('Georeferenced brush zoom, default scenario, Gaussian display alpha, dry thunder, burn tabs and inland cyclone PASS',base);
}finally{await browser.close();}

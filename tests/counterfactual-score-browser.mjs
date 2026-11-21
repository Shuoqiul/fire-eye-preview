import {chromium} from '../../cf-app/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const base=process.env.CF_URL||'http://127.0.0.1:5211';
const browser=await chromium.launch({headless:true,...(process.env.CF_CHROMIUM?{executablePath:process.env.CF_CHROMIUM}:{})});
const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.route('**/*',request=>new URL(request.request().url()).origin===new URL(base).origin?request.continue():request.abort());
 await page.goto(base);
 await page.waitForFunction(()=>window.fireEyePreview?.ready&&window.FireCounterfactual,null,{timeout:60000});
 await page.evaluate(()=>fireEyeCounterfactual.open());
 const gridData=await page.evaluate(async()=>{
  const api=fireEyePreview,loaded=await api.gridFor(api.manifest,api.active.run),g=loaded.grid,n=g.width*g.height;
  return {grid:g,encoded:Array.from({length:n},(_,i)=>loaded.view.getUint16(2*i,true)),values:Array.from({length:n},(_,i)=>loaded.view.getUint16(2*i,true)),endpoint:api.active.id,opacity:api.riskOpacity,visible:api.riskVisible};
 });
 await page.locator('[data-event="high_wind"]').click();await page.keyboard.press('Escape');
 const calm=await page.evaluate(async()=>{
  const api=fireEyeCounterfactual;api.setEvent({...api.defaults('high_wind'),windMph:0,startH:0,durationH:24});const result=await api.run(),w=result.windows[api.state.windowIndex],score=result.score.delta[api.state.windowIndex];
  return {footprint:result?.footprint.cells,span:result?.scoreSpan,delta:Array.from(w.publishedBaseline).every((value,i)=>Number.isNaN(value)?Number.isNaN(score[i]):score[i]===0),status:api.state.status,opacity:fireEyePreview.riskOpacity,layer:fireEyePreview.active.id};
 });
 assert.ok(calm.footprint>0,calm.status);assert.equal(calm.span,0);assert.equal(calm.delta,true);
 assert.equal(calm.opacity,gridData.opacity);assert.equal(calm.layer,gridData.endpoint);
 const wind=await page.evaluate(async()=>{
  const api=fireEyeCounterfactual;api.setEvent({...api.defaults('high_wind'),windMph:58,startH:0,durationH:24,radiusKm:100,center:[-110,33]});const r=await api.run(),w=r.windows[api.state.windowIndex],score=r.score.delta[api.state.windowIndex],i=[...r.footprint.indices].find(j=>score[j]>1e-5&&w.scenario[j]>w.baseline[j]&&r.score.scenario[api.state.windowIndex][j]>r.score.published[api.state.windowIndex][j]);
  api.setView('scenario');if(i===undefined)throw Error('No interior wind cell with an increased score');
  await new Promise(resolve=>{const check=()=>{if(fireEyePreview.map.isSourceLoaded('cf-result'))resolve();else setTimeout(check,10);};check();});
  const rendered=fireEyePreview.map.getSource('cf-result').serialize().data,features=typeof rendered==='string'?JSON.parse(rendered).features.length:rendered?rendered.features.length:0;
  return {span:r.scoreSpan,inside:i,cell:{published:r.score.published[api.state.windowIndex][i],scenario:r.score.scenario[api.state.windowIndex][i],delta:score[i],nativeBaseline:w.baseline[i],nativeScenario:w.scenario[i]},features,opacity:fireEyePreview.riskOpacity,layer:fireEyePreview.active.id};
 });
 assert.ok(wind.span>0&&wind.span<=1);assert.ok(wind.cell.scenario>wind.cell.published);assert.ok(wind.cell.nativeScenario>wind.cell.nativeBaseline);assert.ok(wind.features>0);assert.equal(wind.opacity,gridData.opacity);assert.equal(wind.layer,gridData.endpoint);
 const sourceReadback=await page.evaluate(async()=>{
  const map=fireEyePreview.map;await new Promise(resolve=>{const check=()=>map.isSourceLoaded('cf-result')?resolve():setTimeout(check,10);check();});
  const raw=map.getSource('cf-result').serialize().data,data=typeof raw==='string'?JSON.parse(raw):raw;
  const cells=data.features.map(f=>f.properties);
  return {count:data.features.length,changed:cells.filter(p=>p.delta!==0).length,exact:cells.every(p=>p.delta===0||p.delta===Math.fround(p.scenario-p.baseline)),bounded:cells.every(p=>p.scenario>=0&&p.scenario<=1)};
 });
 assert.ok(sourceReadback.changed>0,JSON.stringify(sourceReadback));
 assert.equal(sourceReadback.exact,true);assert.equal(sourceReadback.bounded,true);
 await page.evaluate(()=>fireEyeCounterfactual.setView('published'));
 assert.equal(await page.evaluate(()=>fireEyePreview.active.id),gridData.endpoint);
 const outside=await page.evaluate(()=>{
  const loaded=fireEyeCounterfactual.result;return {indices:[...loaded.footprint.indices],published:Array.from(loaded.score.published[fireEyeCounterfactual.state.windowIndex])};
 });
 const selected=new Set(outside.indices);
for(let i=0;i<gridData.values.length;i++){
 const source=gridData.values[i];
 if(source===gridData.grid.nodata)assert.ok(Number.isNaN(outside.published[i]),'released nodata remains NaN at '+i);
 else assert.equal(outside.published[i],Math.fround(source*gridData.grid.scale),'published score exact at '+i);
}
const scenario=await page.evaluate(()=>{const api=fireEyeCounterfactual;api.setView('scenario');const r=api.result,w=r.windows[api.state.windowIndex],s=r.score;return {cells:[...r.footprint.indices].map(i=>({index:i,published:s.published[api.state.windowIndex][i],scenario:s.scenario[api.state.windowIndex][i],delta:s.delta[api.state.windowIndex][i],baseline:w.baseline[i],a:w.scenario[i]}))};});
const outsideScore=new Set(outside.indices);
for(const cell of scenario.cells){
 if(!outsideScore.has(cell.index))continue;
 const source=outside.published[cell.index];
 assert.equal(cell.published,source,'published cell pair '+cell.index);
 assert.ok(Number.isFinite(cell.scenario)&&cell.scenario>=0&&cell.scenario<=1,'scenario bounds '+cell.index);
 assert.equal(cell.delta,Math.fround(cell.scenario-cell.published),'Float32 score delta from same cell pair '+cell.index);
 assert.ok(Number.isFinite(cell.baseline)&&Number.isFinite(cell.a),'native diagnostics retained '+cell.index);
 assert.ok(Math.abs(cell.published-source)<=Number.EPSILON*Math.max(1,source),'published cell unchanged '+cell.index);
}
 assert.equal(gridData.encoded.length,gridData.values.length);assert.equal(outside.indices.length,await page.evaluate(()=>fireEyeCounterfactual.result.footprint.cells));
 assert.ok(selected.size>0);
 const outsideChanges=[];for(let i=0;i<outside.published.length;i++)if(!selected.has(i))outsideChanges.push(outside.published[i]);
 assert.equal(outsideChanges.length,outside.published.length-selected.size);
 await page.locator('[data-event="thunderstorm"]').click();await page.keyboard.press('Escape');
 const dry=await page.evaluate(async()=>{const api=fireEyeCounterfactual;api.setEvent({...api.defaults('thunderstorm'),rainIn:0,dry:true,startH:0,durationH:24});const r=await api.run(),w=r.windows[api.state.windowIndex],score=r.score.delta[api.state.windowIndex];return {span:r.scoreSpan,delta:Array.from(w.publishedBaseline).every((v,i)=>Number.isNaN(v)?Number.isNaN(score[i]):score[i]>=0),text:document.querySelector('#cf-results').textContent};});
 assert.ok(dry.text.includes('Lightning contributes'));assert.ok(dry.span>0&&dry.span<.04);assert.equal(dry.delta,true);
 await page.getByRole('button',{name:'Compare'}).click();assert.equal(await page.evaluate(()=>fireEyeCounterfactual.state.view),'change');
 await page.evaluate(()=>{const api=fireEyeCounterfactual;api.setEvent({...api.defaults('thunderstorm'),rainIn:1,dry:false,startH:0,durationH:24});});
 const wet=await page.evaluate(async()=>{const api=fireEyeCounterfactual,r=await api.run();return {span:r.scoreSpan,changed:[...r.score.delta[api.state.windowIndex]].some(v=>v<0)};});
 assert.ok(wet.changed&&wet.span>0);
 const coast=await page.evaluate(async()=>{
  const api=fireEyeCounterfactual;api.setEvent({...api.defaults('hurricane'),track:[[-76,32,100],[-78,33,100],[-82,35,100],[-85,36,100],[-89,37,100],[-96,38,100]],center:[-76,32],validHours:0,landfallHours:12,rainIn:0,startH:0,durationH:24});const r=await api.run(),w=r.windows[api.state.windowIndex],nativeChanged=[...w.delta].filter(v=>Number.isFinite(v)&&v!==0).length;
  return {cells:r.footprint.cells,scoreSpan:r.scoreSpan,nativeSpan:r.span,nativeChange:w.summary.delta,nativeChanged};
 });
 assert.ok(coast.cells>0&&coast.nativeSpan>0&&coast.nativeChanged>0);assert.ok(coast.scoreSpan>0&&coast.scoreSpan<1);
 await page.evaluate(()=>fireEyeCounterfactual.close());
 assert.equal(await page.evaluate(()=>fireEyePreview.riskOpacity),gridData.opacity);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({grid:gridData.grid.width+'x'+gridData.grid.height,calm,wind,dry,wet,coast,errors},null,2));
}finally{await browser.close();}

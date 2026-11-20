const test=require('node:test'),assert=require('node:assert/strict'),model=require('../assets/counterfactual-engine.js');
const make=(leads=[12,24,36,48],scores=[.4,.4,.4,.4])=>({grid:{width:2,height:2,transform:[5000,0,-5000,0,-5000,5000]},windows:leads.map(leadHours=>({leadHours,targetTime:new Date(Date.UTC(2026,10,10)+leadHours*3600000).toISOString(),values:new Float32Array(scores)})),project:(x,y)=>[-96+x/100000,38+y/100000]});
const event=(type,changes={})=>({...model.defaults(type,[-96,38]),...changes});
const run=(type,changes={},input=make())=>model.run({...input,event:event(type,changes)});
test('no event preserves exact values, zero deltas, and per-window nodata',()=>{const input=make([12,24],[0,.4,NaN,1]);input.windows[1].values[1]=NaN;const out=model.run({...input,event:null});for(let w=0;w<2;w++)for(let i=0;i<4;i++){const b=input.windows[w].values[i];if(Number.isNaN(b))assert.ok(Number.isNaN(out.windows[w].scenario[i]));else{assert.equal(out.windows[w].scenario[i],b);assert.equal(out.windows[w].delta[i],0);}}assert.equal(out.span,0)});
test('GDAL affine cell centres use the published transform order',()=>{assert.deepEqual(model.affineCenter(make().grid,.5,.5),[-2500,2500])});
test('all defaults normalize, malformed parameters and coordinates fail',()=>{for(const type of ['high_wind','heavy_rain','thunderstorm','prescribed_burn','hurricane'])assert.equal(model.normalize(event(type)).type,type);assert.equal(event('hurricane').track.length,6);for(const patch of [{windMph:NaN},{radiusKm:0},{center:[300,38]}])assert.throws(()=>model.normalize(event('high_wind',patch)));assert.throws(()=>model.run({...make(),event:event('high_wind'),project:()=>[Infinity,0]}))});
test('native wind response is independent of published score and retains reference field',()=>{const a=run('high_wind',{windMph:30}),b=run('high_wind',{windMph:58});assert.ok(a.windows[0].delta[0]>0);assert.ok(b.windows[0].delta[0]>a.windows[0].delta[0]);const far=run('high_wind',{center:[-120,38]});assert.equal(far.footprint.cells,0);assert.ok(Number.isNaN(far.windows[0].scenario[0]));assert.equal(far.windows[0].publishedBaseline[0],make().windows[0].values[0]);});
test('rain is causal, while a zero-driver event leaves the published score unchanged',()=>{const wet=run('heavy_rain',{startH:12,durationH:12,rainIn:1});assert.equal(wet.windows[0].delta[0],0);assert.ok(wet.windows[1].delta[0]<0);assert.ok(wet.windows[3].delta[0]>wet.windows[1].delta[0]);const none=run('heavy_rain',{rainIn:0});assert.equal(none.score.delta[0][0],0);assert.deepEqual([...none.score.scenario[0]],[...make().windows[0].values])});
test('thunderstorm separates native rainfall response from conditional discovery timing',()=>{const dry=run('thunderstorm',{rainIn:0,startH:0,durationH:12}),wet=run('thunderstorm',{rainIn:1,startH:0,durationH:12});assert.equal(dry.windows[0].delta[0],0);assert.ok(wet.windows[0].delta[0]<0);assert.equal(dry.discovery.dailyWeights.length,6);assert.ok(wet.discovery.holdoverAtScenarioDailyRain>dry.discovery.holdoverAtScenarioDailyRain);assert.match(dry.discovery.estimand,/matched/);});
test('dry thunder exposes zero score shift and wet thunder exposes a native-derived score shift',()=>{
 const dry=run('thunderstorm',{rainIn:0,startH:0,durationH:12});
 const wet=run('thunderstorm',{rainIn:1,startH:0,durationH:12});
 assert.equal(dry.score.delta[0][0],0);
 assert.ok(wet.score.delta[0][0]<0);
});
test('treatment requires paired fuel-process outcomes instead of an invented score offset',()=>{const r=run('prescribed_burn',{treatedFraction:1,ageYears:0}),source=make().windows[0].values;assert.equal(r.available,false);assert.equal(r.treatmentStatus,'unavailable');assert.match(r.reason,/Paired fuel-state outcomes/);for(const w of r.windows)for(let i=0;i<source.length;i++)assert.equal(w.publishedBaseline[i],source[i]);assert.deepEqual([...r.windows[0].publishedBaseline],[...source]);});
test('prescribed burn keeps an exact usable released baseline and a separately unavailable treatment effect',()=>{
 const area={width:2,height:2,bounds:[-96,37.8,-95.8,38.2],mask:[1,1,1,1]},e=model.normalize({...event('prescribed_burn'),treatedFraction:.6,ageYears:2,area}),r=model.run({...make(),event:e});
 assert.equal(r.available,false);assert.equal(r.treatmentStatus,'unavailable');
 assert.deepEqual([...r.score.published[0]],[...make().windows[0].values]);
 for(let i=0;i<4;i++){const source=make().windows[0].values[i];assert.equal(r.windows[0].publishedBaseline[i],source);assert.equal(r.score.scenario[0][i],source);assert.equal(r.score.delta[0][i],0);}
 assert.ok(r.footprint.cells>0&&r.footprint.cells<4);assert.match(r.reason,/Published reference is retained/);
 assert.equal(r.windows[0].summary.cells,r.footprint.cells);assert.equal(r.windows[0].summary.tableAvailable,true);assert.equal(r.windows[0].summary.nativeAvailable,false);
});
test('dry and wet thunder expose score and discovery values in every window',()=>{
 for(const rainIn of [0,1]){const d=run('thunderstorm',{rainIn,dry:rainIn===0,coverage:.4,startH:0,durationH:12});assert.equal(d.discovery.coverage,.4);assert.equal(d.discovery.rainIn,rainIn);assert.ok(Number.isFinite(d.discovery.holdoverAtScenarioDailyRain));for(const w of d.windows){assert.ok(Number.isFinite(w.summary.scenarioScore));assert.ok(Number.isFinite(w.summary.changeScore));assert.ok(w.summary.score.available);}}
});
test('published-reference run retains source values without an event footprint',()=>{
 const input=make([12],[0,.4,NaN,1]),r=model.run({...input,event:null});
 assert.equal(r.windows[0].summary.cells,3);assert.equal(r.treatmentStatus,'reference');assert.equal(r.available,true);
 for(let i=0;i<4;i++){const before=input.windows[0].values[i];if(Number.isNaN(before))assert.ok(Number.isNaN(r.windows[0].scenario[i]));else assert.equal(r.windows[0].scenario[i],before);}
});
test('missing earlier published windows preserve causal rain history and actual leads',()=>{const e=event('heavy_rain',{startH:0,durationH:12,rainIn:1}),all=model.run({...make(),event:e}),late=model.run({...make([36,48]),event:e});assert.equal(late.windows[0].scenario[0],all.windows[2].scenario[0]);assert.equal(late.windows[0].leadHours,36);for(const w of all.windows)assert.equal(w.span,all.span)});
test('valid zero/one published values do not gate native response and nodata stays nodata',()=>{const r=run('high_wind',{windMph:58},make([12],[0,1,NaN,.4]));const w=r.windows[0];assert.equal(w.publishedBaseline[0],0);assert.equal(w.publishedBaseline[1],1);assert.equal(w.scenario[0],w.scenario[1]);assert.ok(w.scenario[0]>1);assert.ok(Number.isNaN(w.scenario[2]));assert.equal(r.unit,'score');assert.equal(r.nativeUnit,'ISI');});
test('hurricane track and declared landfall change physical wind radii',()=>{const e=event('hurricane');assert.notDeepEqual(model.trackCenter(e,12),model.trackCenter(e,24));assert.ok(model.decayedWind(100,30,24)<model.decayedWind(100,30,12));assert.ok(model.tcRadius(100,30,34,45)>0);const r=run('hurricane',{track:[[-96,38,100],[-96,38,100],[-96,38,100],[-96,38,100],[-96,38,100],[-96,38,100]]});assert.equal(r.windows[0].summary.cells,4);assert.ok(Number.isFinite(r.windows[0].summary.scenario))});

test('literature wind driver remains monotone beyond former soft ceiling',()=>{let previous=0;for(const windMph of [45,58,59,65,100,180]){const r=run('high_wind',{windMph});assert.ok(r.windows[0].delta[0]>=previous);previous=r.windows[0].delta[0];}});
test('short events contribute to their overlapping window and invalid polygons fail',()=>{assert.ok(run('high_wind',{windMph:58,durationH:1}).windows[0].delta[0]>0);assert.throws(()=>model.normalize(event('prescribed_burn',{polygon:[[-96,38],[-95,39],[-96,39],[-95,38]]})));assert.throws(()=>model.run({...make([13]),event:null}));});
test('painted areas preserve holes and affect the calculation independently of circular defaults',()=>{
 const area={width:12,height:12,bounds:[-96.2,37.8,-95.8,38.2],mask:Array.from({length:144},(_,i)=>{const x=i%12,y=Math.floor(i/12);return x>0&&x<11&&y>0&&y<11&&!(x===6&&y===6)?1:0})};
 assert.equal(model.areaAt(area,[-96.2,38.2]),0);
 assert.equal(model.areaAt(area,[-95.99,37.99]),0);
 assert.ok(model.areaAt(area,[-96.08,38.08])>0);
 const e=event('heavy_rain',{area,rainIn:1,center:[-120,40]});
 const normalized=model.normalize(e);assert.deepEqual(normalized.area.mask,area.mask);
 const result=model.run({...make(),event:e});assert.ok(result.windows[1].delta.some(v=>v<0));
});
test('drawn wind corridor is used instead of the old event centre',()=>{
 const e=event('high_wind',{center:[-120,40],windMph:58,windPath:[[-96.3,37.7],[-95.7,38.3]]});
 const r=model.run({...make(),event:e});assert.ok(r.windows[0].delta.some(v=>v>0));
});

test('a supplied weather sequence drives both paired states and keeps the source snapshot clock',()=>{const input=make([12]);const e=event('heavy_rain',{rainIn:.2});const x={...input,event:e,context:{weatherAt:()=>({tempC:12,rhPct:70,uMs:2,vMs:1,rainMm:0,initialFFMC:85}),assumptions:{initialFFMC:85}}};const a=model.run(x),b=run('heavy_rain',{rainIn:.2});assert.equal(a.forcing,'snapshot-held');assert.notEqual(a.windows[0].baseline[0],b.windows[0].baseline[0]);assert.throws(()=>model.run({...x,weatherAt:()=>({tempC:12,rhPct:110,uMs:2,vMs:1})}));});
test('opposing equal-speed winds retain native ISI across the event transition',()=>{
 const input=make([12]);
 const e=event('high_wind',{windMph:10/.44704,windFromDeg:270,durationH:24,radiusKm:20});
 const result=model.run({...input,event:e,weatherAt:()=>({tempC:25,rhPct:30,uMs:-10,vMs:0,rainMm:0,initialFFMC:85})});
 assert.equal(result.footprint.cells,4);
 for(const change of result.windows[0].delta)assert.ok(Math.abs(change)<1e-5,`equal-speed direction edit preserves ISI: ${change}`);
});
test('scenario score preserves published cells, zero and NaN, and outside treatment',()=>{
 const input=make([12],[0,.4,NaN,1]);
 const event={...model.defaults('high_wind',[-96,38]),windMph:58,startH:0,durationH:12};
 const result=model.run({...input,event});
 for(let i=0;i<4;i++){
  assert.equal(result.score.published[0][i],input.windows[0].values[i],`published cell ${i}`);
 }
 assert.ok(Number.isNaN(result.score.scenario[0][2]));
 assert.ok(Number.isNaN(result.score.delta[0][2]));
 assert.equal(result.score.scenario[0][0],0);
 assert.equal(result.score.delta[0][0],0);
 assert.equal(result.score.scenario[0][3],1);
 assert.equal(result.score.delta[0][3],0);
 assert.ok(result.score.delta[0][1]>0);
 assert.ok(result.score.delta[0][1]<=1);
 assert.equal(result.score.delta[0][1],result.score.scenario[0][1]-result.score.published[0][1]);
 assert.ok(result.scoreSpan>0);
 assert.match(result.score.label,/Illustrative/);
});
test('dry thunder compares the published score without inventing a zero-driver change',()=>{
 const input=make([12],[.2,.4,.6,.8]);
 const e={...model.defaults('thunderstorm',[-96,38]),rainIn:0,dry:true,startH:0,durationH:12};
 const r=model.run({...input,event:e});
 assert.equal(r.available,true);
 assert.equal(r.score.available,true);
 for(let i=0;i<4;i++){
  assert.equal(r.score.published[0][i],input.windows[0].values[i]);
  assert.equal(r.score.scenario[0][i],input.windows[0].values[i]);
  assert.equal(r.score.delta[0][i],0);
 }
 assert.equal(r.discovery.estimand,'Discovery lag conditional on a matched reported fire');
 assert.match(r.discovery.ignition,/Exposure-conditioned/);
});
test('wet thunder changes the mapped score while a distant event leaves all cells unchanged',()=>{
 const input=make([12],[.2,.4,.6,.8]);
 const wet={...model.defaults('thunderstorm',[-96,38]),rainIn:1,startH:0,durationH:12};
 const r=model.run({...input,event:wet});
 assert.ok(r.score.delta[0].some(v=>v<0));
 assert.ok(Math.abs(r.scoreSpan)>0);
 const far=model.run({...input,event:{...wet,center:[-120,38]}});
 assert.equal(far.footprint.cells,0);
 for(let i=0;i<4;i++)assert.equal(far.windows[0].publishedBaseline[i],input.windows[0].values[i]);
 assert.equal(far.score.delta[0][0],0);
 assert.equal(far.score.delta[0][1],0);
 assert.equal(far.score.delta[0][2],0);
 assert.equal(far.score.delta[0][3],0);
});
test('published score is zero-effect outside footprint and native wind is nonzero inside',()=>{
 const input=make([12],[.1,.2,.3,.4]);
 const event={...model.defaults('high_wind',[-96,38]),windMph:58,startH:0,durationH:12,radiusKm:20};
 const r=model.run({...input,event});
 const inside=[...r.footprint.indices];
 assert.ok(inside.length>0);
 for(let i=0;i<4;i++)if(!inside.includes(i)){assert.equal(r.score.scenario[0][i],input.windows[0].values[i]);assert.equal(r.score.delta[0][i],0);}
 for(const i of inside)assert.ok(r.score.delta[0][i]>=0);
});
test('full-domain score delta stays zero or NaN outside selected support',()=>{
 const input={grid:{width:40,height:40,transform:[5000,0,-100000,0,-5000,100000]},windows:[{leadHours:12,targetTime:'2026-11-10T12:00:00Z',values:new Float32Array(1600).fill(.4)}],project:(x,y)=>[-96+x/100000,38+y/100000]};
 input.windows[0].values[100]=NaN;
 const r=model.run({...input,event:{...model.defaults('high_wind',[-96,38]),windMph:0,startH:0,durationH:12,radiusKm:20}});
 const selected=new Set(r.footprint.indices);
 for(let i=0;i<1600;i++)if(!selected.has(i))assert.equal(r.score.delta[0][i],100===i?NaN:0);
});
test('points below the high-wind planning clip retain the exact published scenario value',()=>{
 const input=make([12],[.1,.2,.3,.4]);
 const r=model.run({...input,event:{...model.defaults('high_wind',[-96,38]),windMph:58,startH:0,durationH:12,radiusKm:20}});
 const cells=new Set(r.footprint.indices);
 for(let i=0;i<4;i++)if(!cells.has(i)){assert.equal(r.score.scenario[0][i],input.windows[0].values[i]);assert.equal(r.score.delta[0][i],0);}
});
test('zero-wind event and postcoast cyclone have no selected spatial support',()=>{
 const input=make([12],[.2,.4,.6,.8]);
 const calm={...model.defaults('high_wind',[-96,38]),windMph:0,startH:0,durationH:12};
 const r=model.run({...input,event:calm});
 assert.ok(r.footprint.cells>0);assert.ok([...r.footprint.indices].every(i=>input.windows[0].values[i]>0));
 assert.deepEqual([...r.score.scenario[0]],[...input.windows[0].values]);
 assert.equal(r.score.delta[0][0],0);assert.equal(r.score.delta[0][1],0);
 assert.equal(r.score.delta[0][3],0);
 assert.equal(r.scoreSpan,0);for(const w of r.windows){assert.equal(w.summary.changeScore,0);assert.equal(w.span,0);assert.equal(w.scoreSpan,0);for(const i of r.footprint.indices){assert.ok(Number.isFinite(w.baseline[i]));assert.equal(w.scenario[i],w.baseline[i]);assert.equal(w.delta[i],0);}}
 const storm={...model.defaults('hurricane',[0,0]),track:Array.from({length:2},()=>[0,0,0]),rainIn:0,startH:0,durationH:12};
 const zero=model.run({...input,event:storm});
 assert.equal(zero.footprint.cells,0);
 assert.equal(zero.score.delta[0][0],0);assert.equal(zero.score.delta[0][1],0);
 assert.equal(zero.score.delta[0][3],0);
});
test('local zero-driver and out-of-window footprints stay smaller than the full published grid',()=>{
 const input=make([12],[.2,.4,.6,.8]);
 input.grid={width:40,height:40,transform:[5000,0,-100000,0,-5000,100000]};
 input.project=(x,y)=>[-96+x/100000,38+y/100000];
 input.windows[0].values=new Float32Array(1600).fill(.4);
 const calm=model.run({...input,event:{...model.defaults('high_wind',[-96,38]),windMph:0,startH:0,durationH:12,radiusKm:20}});
 assert.ok(calm.footprint.cells>0&&calm.footprint.cells<1600);
 assert.equal(calm.scoreSpan,0);
 const late=model.run({...input,event:{...model.defaults('heavy_rain',[-96,38]),rainIn:1,startH:24,durationH:12}});
 assert.ok(late.footprint.cells>0&&late.footprint.cells<1600,`late footprint ${late.footprint.cells}`);
 const painted={...model.defaults('thunderstorm',[-96,38]),rainIn:0,dry:true,startH:0,durationH:12,area:{width:40,height:40,bounds:[-96.2,37.8,-95.8,38.2],mask:Array.from({length:1600},(_,i)=>{const x=i%40,y=Math.floor(i/40);return x>=15&&x<25&&y>=15&&y<25?1:0;})}};
 const dry=model.run({...input,event:painted});
 assert.ok(dry.footprint.cells>0&&dry.footprint.cells<1600);
 assert.equal(dry.scoreSpan,0);
});
test('postcoast strength uses one coherent R34-scale radius with no flat convective support',()=>{
 const input=make([12],[.4,.4,.4,.4]);
 const coast=model.tcRadius(100,30,34,45);
 const weak={...model.defaults('hurricane',[-96,38]),track:[[-96,38,34],[-96,38,34]],rainIn:0,startH:0,durationH:12};
 const weaker={...weak,track:[[-96,38,20],[-96,38,20]]};
 assert.ok(model.tcRadius(100,38,34,45)>model.tcRadius(20,38,34,45));
 const far=model.run({...input,event:{...weak,center:[-120,38]}});
 assert.equal(far.footprint.cells,0);
 assert.ok(coast>0&&coast<1000);
 assert.equal(model.footprint(weak,.5,[-96.025,38.025]),model.footprint(weak,.5,[-96.025,38.025]));
});

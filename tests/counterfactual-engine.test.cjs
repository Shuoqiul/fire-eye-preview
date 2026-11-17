const test=require('node:test'),assert=require('node:assert/strict'),model=require('../assets/counterfactual-engine.js');
const make=(leads=[12,24,36,48],scores=[.4,.4,.4,.4])=>({grid:{width:2,height:2,transform:[5000,0,-5000,0,-5000,5000]},windows:leads.map(leadHours=>({leadHours,targetTime:new Date(Date.UTC(2026,10,10)+leadHours*3600000).toISOString(),values:new Float32Array(scores)})),project:(x,y)=>[-96+x/100000,38+y/100000]});
const event=(type,changes={})=>({...model.defaults(type,[-96,38]),...changes});
const run=(type,changes={},input=make())=>model.run({...input,event:event(type,changes)});
test('no event preserves exact values, zero deltas, and per-window nodata',()=>{const input=make([12,24],[0,.4,NaN,1]);input.windows[1].values[1]=NaN;const out=model.run({...input,event:null});for(let w=0;w<2;w++)for(let i=0;i<4;i++){const b=input.windows[w].values[i];if(Number.isNaN(b))assert.ok(Number.isNaN(out.windows[w].scenario[i]));else{assert.equal(out.windows[w].scenario[i],b);assert.equal(out.windows[w].delta[i],0);}}assert.equal(out.span,0)});
test('GDAL affine cell centres use the published transform order',()=>{assert.deepEqual(model.affineCenter(make().grid,.5,.5),[-2500,2500])});
test('all defaults normalize, malformed parameters and coordinates fail',()=>{for(const type of ['high_wind','heavy_rain','thunderstorm','prescribed_burn','hurricane'])assert.equal(model.normalize(event(type)).type,type);assert.equal(event('hurricane').track.length,6);for(const patch of [{windMph:NaN},{radiusKm:0},{center:[300,38]}])assert.throws(()=>model.normalize(event('high_wind',patch)));assert.throws(()=>model.run({...make(),event:event('high_wind'),project:()=>[Infinity,0]}))});
test('native wind response is independent of published score and retains reference field',()=>{const a=run('high_wind',{windMph:30}),b=run('high_wind',{windMph:58});assert.ok(a.windows[0].delta[0]>0);assert.ok(b.windows[0].delta[0]>a.windows[0].delta[0]);const far=run('high_wind',{center:[-120,38]});assert.equal(far.footprint.cells,0);assert.ok(Number.isNaN(far.windows[0].scenario[0]));assert.equal(far.windows[0].publishedBaseline[0],make().windows[0].values[0]);});
test('rain is causal and recovers after event, while no-rain produces identity',()=>{const wet=run('heavy_rain',{startH:12,durationH:12,rainIn:1});assert.equal(wet.windows[0].delta[0],0);assert.ok(wet.windows[1].delta[0]<0);assert.ok(wet.windows[3].delta[0]>wet.windows[1].delta[0]);assert.equal(run('heavy_rain',{rainIn:0}).windows[0].delta[0],0)});
test('thunderstorm separates native rainfall response from conditional discovery timing',()=>{const dry=run('thunderstorm',{rainIn:0,startH:0,durationH:12}),wet=run('thunderstorm',{rainIn:1,startH:0,durationH:12});assert.equal(dry.windows[0].delta[0],0);assert.ok(wet.windows[0].delta[0]<0);assert.equal(dry.discovery.dailyWeights.length,6);assert.ok(wet.discovery.holdoverAtScenarioDailyRain>dry.discovery.holdoverAtScenarioDailyRain);assert.match(dry.discovery.estimand,/matched/);});
test('treatment requires paired fuel-process outcomes instead of an invented score offset',()=>{const r=run('prescribed_burn',{treatedFraction:1,ageYears:0});assert.equal(r.available,false);assert.match(r.reason,/Fuel-state/);assert.ok(r.windows.every(w=>w.scenario.every(Number.isNaN)));assert.deepEqual([...r.windows[0].publishedBaseline],[...make().windows[0].values]);});
test('missing earlier published windows preserve causal rain history and actual leads',()=>{const e=event('heavy_rain',{startH:0,durationH:12,rainIn:1}),all=model.run({...make(),event:e}),late=model.run({...make([36,48]),event:e});assert.equal(late.windows[0].scenario[0],all.windows[2].scenario[0]);assert.equal(late.windows[0].leadHours,36);for(const w of all.windows)assert.equal(w.span,all.span)});
test('valid zero/one published values do not gate native response and nodata stays nodata',()=>{const r=run('high_wind',{windMph:58},make([12],[0,1,NaN,.4]));const w=r.windows[0];assert.equal(w.publishedBaseline[0],0);assert.equal(w.publishedBaseline[1],1);assert.equal(w.scenario[0],w.scenario[1]);assert.ok(w.scenario[0]>1);assert.ok(Number.isNaN(w.scenario[2]));assert.equal(r.unit,'ISI');});
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

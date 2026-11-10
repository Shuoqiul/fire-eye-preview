const test=require('node:test'),assert=require('node:assert/strict'),model=require('../assets/counterfactual-engine.js');
const make=(leads=[12,24,36,48],scores=[.4,.4,.4,.4])=>({grid:{width:2,height:2,transform:[5000,0,-5000,0,-5000,5000]},windows:leads.map(leadHours=>({leadHours,targetTime:new Date(Date.UTC(2026,10,10)+leadHours*3600000).toISOString(),values:new Float32Array(scores)})),project:(x,y)=>[-96+x/100000,38+y/100000]});
const event=(type,changes={})=>({...model.defaults(type,[-96,38]),...changes});
const run=(type,changes={},input=make())=>model.run({...input,event:event(type,changes)});
test('no event preserves exact values, zero deltas, and per-window nodata',()=>{const input=make([12,24],[0,.4,NaN,1]);input.windows[1].values[1]=NaN;const out=model.run({...input,event:null});for(let w=0;w<2;w++)for(let i=0;i<4;i++){const b=input.windows[w].values[i];if(Number.isNaN(b))assert.ok(Number.isNaN(out.windows[w].scenario[i]));else{assert.equal(out.windows[w].scenario[i],b);assert.equal(out.windows[w].delta[i],0);}}assert.equal(out.span,0)});
test('GDAL affine cell centres use the published transform order',()=>{assert.deepEqual(model.affineCenter(make().grid,.5,.5),[-2500,2500])});
test('all defaults normalize, malformed parameters and coordinates fail',()=>{for(const type of ['high_wind','heavy_rain','thunderstorm','prescribed_burn','hurricane'])assert.equal(model.normalize(event(type)).type,type);assert.equal(event('hurricane').track.length,6);for(const patch of [{windMph:NaN},{radiusKm:0},{center:[300,38]}])assert.throws(()=>model.normalize(event('high_wind',patch)));assert.throws(()=>model.run({...make(),event:event('high_wind'),project:()=>[Infinity,0]}))});
test('wind response is positive, stronger wind increases it, distant cells remain unchanged',()=>{const a=run('high_wind',{windMph:30}),b=run('high_wind',{windMph:58});assert.ok(a.windows[0].delta[0]>0);assert.ok(b.windows[0].delta[0]>a.windows[0].delta[0]);const far=run('high_wind',{center:[-120,38]});assert.equal(far.windows[0].delta[0],0)});
test('rain is causal and recovers after event, while no-rain produces identity',()=>{const wet=run('heavy_rain',{startH:12,durationH:12,rainIn:1});assert.equal(wet.windows[0].delta[0],0);assert.ok(wet.windows[1].delta[0]<0);assert.ok(wet.windows[3].delta[0]>wet.windows[1].delta[0]);assert.equal(run('heavy_rain',{rainIn:0}).windows[0].delta[0],0)});
test('dry lightning rises with a delayed peak and wet lightning has a lower response',()=>{const dry=run('thunderstorm',{rainIn:0,dry:true,startH:0,durationH:12}),wet=run('thunderstorm',{rainIn:1,dry:false,startH:0,durationH:12});assert.ok(dry.windows[0].delta[0]>0);assert.ok(dry.windows[2].delta[0]>dry.windows[0].delta[0]);assert.ok(wet.windows[0].delta[0]<dry.windows[0].delta[0])});
test('burn effect persists across windows and fades with treatment age',()=>{const young=run('prescribed_burn',{treatedFraction:1,ageYears:0}),old=run('prescribed_burn',{treatedFraction:1,ageYears:32});assert.ok(young.windows[0].delta[0]<0);assert.equal(young.windows[3].delta[0],young.windows[0].delta[0]);assert.ok(old.windows[0].delta[0]>young.windows[0].delta[0])});
test('missing earlier published windows preserve causal rain history and actual leads',()=>{const e=event('heavy_rain',{startH:0,durationH:12,rainIn:1}),all=model.run({...make(),event:e}),late=model.run({...make([36,48]),event:e});assert.equal(late.windows[0].scenario[0],all.windows[2].scenario[0]);assert.equal(late.windows[0].leadHours,36);for(const w of all.windows)assert.equal(w.span,all.span)});
test('zero and one scores and nodata remain bounded under events',()=>{const r=run('high_wind',{windMph:58},make([12],[0,1,NaN,.4]));assert.equal(r.windows[0].scenario[0],0);assert.equal(r.windows[0].scenario[1],1);assert.ok(Number.isNaN(r.windows[0].scenario[2]));assert.ok(r.windows[0].scenario[3]<=1)});
test('hurricane track and declared landfall change physical wind radii',()=>{const e=event('hurricane');assert.notDeepEqual(model.trackCenter(e,12),model.trackCenter(e,24));assert.ok(model.decayedWind(100,30,24)<model.decayedWind(100,30,12));assert.ok(model.tcRadius(100,30,34,45)>0);const r=run('hurricane',{track:[[-96,38,100],[-96,38,100],[-96,38,100],[-96,38,100],[-96,38,100],[-96,38,100]]});assert.equal(r.windows[0].summary.cells,4);assert.ok(Number.isFinite(r.windows[0].summary.scenario))});

test('stronger wind remains monotone across soft ceiling',()=>{let previous=0;for(const windMph of [45,58,59,65,100,180]){const r=run('high_wind',{windMph});assert.ok(r.windows[0].delta[0]>=previous);previous=r.windows[0].delta[0];}});
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

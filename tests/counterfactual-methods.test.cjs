const test=require('node:test'),assert=require('node:assert/strict'),m=require('../assets/counterfactual-methods.js'),model=require('../assets/counterfactual-engine.js'),area=require('../assets/counterfactual-area.js');
const close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);
const fixture=(type,patch={},leads=[12,24,36,48])=>model.run({grid:{width:1,height:1,transform:[1,0,0,0,-1,0]},windows:leads.map(leadHours=>({leadHours,targetTime:new Date(Date.UTC(2026,10,10)+leadHours*3600000).toISOString(),values:new Float32Array([.3])})),project:()=>[-96,38],event:{...model.defaults(type,[-96,38]),...patch}});
test('CFFDRS classic wind coefficient preserves physical units and a published-equation ratio',()=>{
 close(m.windLogRatio(20,10),.8109484416);close(Math.exp(m.windLogRatio(20,10)),2.250041007486948);
 close(m.windLogRatio(30,20),m.windLogRatio(20,10));assert.equal(m.windLogRatio(10,10),0);
});
test('FFMC wetting has 0.5 mm interception, high-moisture correction and a 250% cap',()=>{
 assert.equal(m.rainMoisture(16,.5),16);close(m.rainMoisture(16,5),114.17642269821333);close(m.rainMoisture(180,5),219.60309259196728);
 let previous=16;for(const rain of [.1,.5,1,2,5,10,25,50,100,1000]){const next=m.rainMoisture(16,rain);assert.ok(next>=previous&&next<=250);previous=next;}
 assert.ok(m.fineFuelFactor(30)<m.fineFuelFactor(16));assert.equal(fixture('heavy_rain',{rainIn:.49/25.4}).span,0);
});
test('fuel memories have actual hour units, exact interval integration and causal recovery',()=>{
 close(m.memoryStep(10,0,10),10*Math.exp(-1.2));close(m.memoryStep(0,10,10,12),10*10/12*(1-Math.exp(-1.2)));
 assert.ok(m.memoryStep(0,10,100,12)>m.memoryStep(0,10,1,12));
 const e=model.defaults('heavy_rain',[-96,38]);Object.assign(e,{startH:11.5,durationH:1});close([12,24,36].reduce((n,h)=>n+model.activeHours(e,h),0),1);
});
test('lightning kernel conserves exposure and union can add an independent ignition to zero baseline',()=>{
 const k=m.lightningKernel();close(k.reduce((a,b)=>a+b,0),1);close(k.slice(4).reduce((a,b)=>a+b,0),.153);
 assert.equal(k[2],0);assert.equal(k[3],0);assert.ok(m.ignitionUnion(0,.02)>0);assert.equal(m.ignitionUnion(.3,0),.3);assert.equal(m.ignitionUnion(1,10),1);close(m.ignitionUnion(.3,.2),1-(1-.3)*Math.exp(-.2));
 const none=fixture('thunderstorm',{coverage:0,rainIn:0});assert.equal(none.span,0);
 const full=fixture('thunderstorm',{rainIn:0,durationH:12},[12,60]),late=fixture('thunderstorm',{rainIn:0,durationH:12},[60]);assert.equal(full.windows[1].scenario[0],late.windows[0].scenario[0]);
});
test('treatment is an area mixture and never increases any score',()=>{
 close(m.treatmentMixture(.4,.1,.25),.325);assert.equal(m.treatmentMixture(.4,.1,0),.4);assert.equal(m.treatmentMixture(.4,.1,1),.1);
 for(const treatedFraction of [0,.1,.5,1])for(const ageYears of [0,2,8,30])for(const w of fixture('prescribed_burn',{treatedFraction,ageYears}).windows)assert.ok(w.delta.every(d=>d<=0));
 const quarter=fixture('prescribed_burn',{treatedFraction:.25,ageYears:0}),whole=fixture('prescribed_burn',{treatedFraction:1,ageYears:0});close(quarter.windows[0].delta[0]*4,whole.windows[0].delta[0],1e-7);
});
test('hurricane Rankine profile peaks near the eyewall and weak landfall winds never strengthen',()=>{
 const vm=100,lat=30,rm=Math.max(20,36.1-.0492*vm+.574*(lat-25)),theta0=15-.55*(lat-25)+1.02*12;
 close(model.tcWind(vm,lat,rm*1.852,theta0),vm);assert.ok(model.tcWind(vm,lat,0,theta0)<10);assert.ok(model.tcWind(vm,lat,rm*1.852*2,theta0)<vm);
 for(const wind of [0,10,20,26,28,60,100])for(const hours of [0,12,24])assert.ok(model.decayedWind(wind,30,hours)<=wind);
 close(model.decayedWind(100,30,12),46.9438727,.001);
});
test('stronger blue/purple areas retain hue and deep-red treatment is more transparent',()=>{
 const rain=area.pixel('heavy_rain',1,.6,true),storm=area.pixel('thunderstorm',1,.6,true),burn=area.pixel('prescribed_burn',1,.6,true);
 assert.ok(rain[2]>rain[0]*2);assert.ok(storm[0]>storm[1]&&storm[2]>storm[1]);assert.ok(burn[0]>burn[2]*2);assert.ok(burn[3]<rain[3]);assert.ok(rain[3]>120);
 assert.equal(area.pixel('heavy_rain',1,0,true)[3],0);assert.equal(area.pixel('prescribed_burn',1,1e-10,true)[3],0);assert.equal(area.pixel('heavy_rain',1,.6,true,0)[3],0);
});

test('hurricane uses local segment motion and weak storms retain rain and wind support',()=>{
 const e=model.defaults('hurricane',[-96,38]);e.track=[[-96,38,60],[-95,38,55],[-95,39,50]];close(model.stormMotion(e,0).bearing,90);close(model.stormMotion(e,12).bearing,0);assert.ok(model.stormMotion(e,12).speed>0);
 const track=Array.from({length:6},()=>[-96.5,38,33]);assert.ok(fixture('hurricane',{track,rainIn:0,coverage:0}).span>0);assert.ok(fixture('hurricane',{track,rainIn:1,coverage:0}).windows.some(w=>w.delta[0]<0));
});

const test=require('node:test'),assert=require('node:assert/strict'),p=require('../assets/counterfactual-presets.js'),m=require('../assets/counterfactual-engine.js'),s=require('../assets/counterfactual-symbols.js');
test('public defaults belong to actual recipes and use now / 24 hours',()=>{
 for(const type of Object.keys(p.groups)){
  const event=p.apply(m.defaults(type,[-96,38]));assert.equal(event.startH,0);assert.equal(event.durationH,24);assert.equal(p.groups[type].filter(r=>p.matches(event,r)).length,1);assert.equal(m.normalize(event).type,type);
 }
 assert.equal(p.groups.hurricane[p.defaultIndex.hurricane][0],'Hurricane');assert.equal(p.groups.thunderstorm[p.defaultIndex.thunderstorm][0],'Scattered, dry');
});
test('five cyclone recipes start exactly at category lower bounds',()=>{
 const levels=['Tropical storm','Severe tropical storm','Typhoon','Severe typhoon','Super typhoon'];
 assert.equal(p.groups.hurricane.length,5);p.groups.hurricane.forEach((r,i)=>{assert.equal(s.intensity(r[1].vmax).label,levels[i]);assert.ok(Math.abs(r[1].windMph-r[1].vmax*1.15077945)<.051);});
 assert.deepEqual(p.groups.heavy_rain.map(r=>r[1].rainIn),[.2,.4,.6,.8,1]);
 assert.equal(p.groups.thunderstorm.length,6);assert.equal(new Set(p.groups.thunderstorm.map(r=>JSON.stringify(r[1]))).size,6);
});
test('track decays gradually offshore, faster near shore and rapidly over land',()=>{
 const track=[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]],original=JSON.stringify(track),at=classify=>p.weakenTrack(track,100,classify),far=at(()=>({land:false,distanceKm:400})),near=at(()=>({land:false,distanceKm:5})),land=at(()=>({land:true,distanceKm:0}));
 assert.ok(far[1][2]>near[1][2]&&near[1][2]>land[1][2]);assert.ok(far[1][2]>95);assert.ok(land[1][2]<50);
 for(const profile of [far,near,land])for(let i=1;i<profile.length;i++){assert.ok(profile[i][2]<profile[i-1][2]);assert.deepEqual(profile[i].slice(0,2),track[i]);}assert.equal(JSON.stringify(track),original);
 const crossing=at(([lon])=>({land:lon>2,distanceKm:Math.max(0,2-lon)*100}));assert.ok(crossing[3][2]/crossing[2][2]<crossing[1][2]/crossing[0][2]);
});
test('installed map land supports coastal distance and holes; shadow width uses absolute speed',()=>{
 const fs=require('node:fs'),classify=p.coastIndex(JSON.parse(fs.readFileSync(require.resolve('../assets/land.geojson'))));
 assert.equal(classify([-96,38]).land,true);assert.equal(classify([-130,38]).land,false);assert.ok(classify([-122.6,37.8]).distanceKm<classify([-130,38]).distanceKm);
 const island=p.coastIndex({features:[{geometry:{type:'Polygon',coordinates:[[[0,0],[3,0],[3,3],[0,3],[0,0]],[[1,1],[2,1],[2,2],[1,2],[1,1]]]}}]});assert.equal(island([.5,.5]).land,true);assert.equal(island([1.5,1.5]).land,false);
 assert.ok(p.shadowRadius(100)>p.shadowRadius(60));assert.ok(p.shadowRadius(60)>p.shadowRadius(30));
});

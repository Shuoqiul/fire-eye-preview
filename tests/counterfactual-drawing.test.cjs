const test=require('node:test'),assert=require('node:assert/strict'),g=require('../assets/counterfactual-drawing.js');
test('smooth preserves endpoints, copies input and bounds output size',()=>{const p=Array.from({length:1000},(_,i)=>[i,Math.sin(i)*10]),before=JSON.stringify(p),s=g.smooth(p);assert.deepEqual(s[0],p[0]);assert.deepEqual(s.at(-1),p.at(-1));assert.ok(s.length<=512);assert.equal(JSON.stringify(p),before)});
test('samples equal arc positions across corners rather than equal chords',()=>{assert.deepEqual(g.sample([[0,0],[10,0],[10,10]],6),[[0,0],[4,0],[8,0],[10,2],[10,6],[10,10]]);assert.equal(g.sample([[0,0],[1,1]],6).length,6)});
test('wind field follows local tangent and tapers response at lateral edges',()=>{
 const path=[[0,0],[1800,0]],low=g.windField(path,96,undefined,12),high=g.windField(path,96,undefined,58),length=v=>Math.hypot(v.to[0]-v.from[0],v.to[1]-v.from[1]);
 assert.ok(low.length&&high.length);for(const arrow of low)assert.ok(arrow.to[0]>arrow.from[0]);
 const centreLength=field=>field.find(v=>v.lane===0).laneSpacing-5;
 assert.ok(Math.abs(centreLength(low)-12)<1e-9);assert.ok(Math.abs(centreLength(high)-58)<1e-9);
 const bend=g.windField([[0,200],[300,0]],120);assert.ok(bend.length);for(const arrow of bend){assert.ok(arrow.to[0]>arrow.from[0]);assert.ok(arrow.to[1]<arrow.from[1]);}
 const edge=low.filter(v=>v.lane!==0),centre=low.filter(v=>v.lane===0);assert.ok(edge.length);assert.ok(edge.every(v=>length(v)<length(centre[0])));
});
test('distance field preserves holes and has stronger interior',()=>{const m=new Uint8Array(49);for(let y=1;y<6;y++)for(let x=1;x<6;x++)m[y*7+x]=1;const d=g.distanceField(m,7,7);assert.ok(d[24]>d[8]);m[24]=0;assert.equal(g.distanceField(m,7,7)[24],0)});
test('dilation and erosion honour radius and disconnected shapes',()=>{const m=new Uint8Array(81);m[40]=1;const a=g.expandMask(m,9,9,1),b=g.expandMask(m,9,9,3);assert.equal(a[41],1);assert.equal(a[42],0);assert.equal(b[43],1);assert.equal(g.expandMask(b,9,9,-1)[40],1);assert.equal(g.expandMask(m,9,9,-1)[40],0)});
test('coast follows viewpoint, zoom and per-component 1.5 degree limit',()=>{const west=g.coastalTrack([-120,38],0),east=g.coastalTrack([-73,40],0);assert.ok(west[0][0]<-122);assert.ok(east[0][0]>-75);for(const p of [west,east])for(let i=1;i<6;i++){assert.ok(Math.abs(p[i][0]-p[i-1][0])<=1.5);assert.ok(Math.abs(p[i][1]-p[i-1][1])<=1.5);}const z=g.coastalTrack([-120,38],10);assert.ok(Math.hypot(z[1][0]-z[0][0],z[1][1]-z[0][1])<.1)});
test('representative default tracks remain offshore against installed land geometry',()=>{
 const fs=require('node:fs'),path=require('node:path'),model=require('../assets/counterfactual-engine.js'),land=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/land.geojson')));
 const onLand=p=>land.features.some(f=>model.inside(f.geometry.coordinates[0],...p)&&!f.geometry.coordinates.slice(1).some(r=>model.inside(r,...p)));
 for(const center of [[-120,38],[-74,40],[-80,25],[-124,48],[-96,38]])for(const p of g.coastalTrack(center,0))assert.equal(onLand(p.slice(0,2)),false);
});
test('sustained wind changes actual arrow length and inversely changes arrow density on the same path',()=>{
 const path=[[0,0],[3000,0]],widths=[40,96,240],length=v=>Math.hypot(v.to[0]-v.from[0],v.to[1]-v.from[1]),count=width=>Array.from({length:101},(_,index)=>g.windField(path,width,undefined,8+index*.5).length);
 for(const mph of [12,27,45,58]){
  const field=g.windField(path,96,undefined,mph),centre=field.filter(v=>v.lane===0);
  assert.ok(centre.length>1);assert.equal(new Set(field.map(v=>v.id)).size,field.length);
  for(const arrow of centre){assert.ok(Math.abs(length(arrow)-mph)<1e-9);assert.ok(Math.abs(arrow.vector[1])<1e-9);}
 }
 const low=g.windField(path,96,undefined,12),high=g.windField(path,96,undefined,58),centreLow=low.filter(v=>v.lane===0),centreHigh=high.filter(v=>v.lane===0);
 assert.ok(centreLow.length>centreHigh.length);assert.ok(Math.min(...centreHigh.map(length))>Math.max(...centreLow.map(length)));
 for(const width of widths){const counts=count(width);for(let i=1;i<counts.length;i++)assert.ok(counts[i]<=counts[i-1]);}
 for(const arrow of [...low,...high])assert.ok(Math.abs(length(arrow)-Math.hypot(...arrow.vector))<1e-9);
});
test('straight-lane arrows use their actual local vector plus a five-pixel gap',()=>{
 for(const speed of [12,27,45,58]){const pitch=speed+5,pathLength=pitch*Math.floor(1800/pitch),field=g.windField([[0,0],[pathLength,0]],96,undefined,speed),centre=field.filter(v=>v.lane===0);assert.ok(centre.length>1);for(let i=1;i<centre.length;i++){const previous=centre[i-1],current=centre[i],gap=current.from[0]-previous.to[0];assert.ok(Math.abs(gap-5)<1e-9);assert.ok(Math.abs(current.laneGap-5)<1e-9);assert.ok(Math.abs(current.laneSpacing-Math.hypot(...current.vector)-5)<1e-9);assert.ok(Math.abs(current.from[0]-previous.to[0]-current.laneGap)<1e-9);}const end=centre.at(-1);assert.ok(Math.abs(end.localStation-end.from[0]-end.vector[0]/2)<1e-9);assert.ok(end.localStation<=pathLength);assert.ok(centre.every(a=>a.to[0]<=pathLength));}
});
test('acute overlap sums tapered vectors and opposite overlap cancels them',()=>{
 const acutePath=[[0,0],[30,60],[60,0]],acute=g.windField(acutePath,80),straight=g.windField([[0,0],[60,0]],80),overlaps=acute.filter(v=>v.contributors>1);
 assert.ok(overlaps.length>=3);assert.ok(acute.every(v=>v.to[0]>v.from[0]));
 for(const arrow of acute){assert.ok(Math.abs(arrow.vector[0]-(arrow.to[0]-arrow.from[0]))<1e-9);assert.ok(Math.abs(arrow.vector[1]-(arrow.to[1]-arrow.from[1]))<1e-9);}
 assert.ok(overlaps.some(v=>Math.hypot(...v.vector)<v.members.reduce((sum,m)=>sum+m.strength*27,0)));
 const contributions=[];for(const arrow of overlaps)for(const member of arrow.members)if(!contributions.some(other=>other.member===member))contributions.push({member,arrow});
 for(const {member,arrow} of contributions){const expected=[0,0];for(const other of contributions.filter(v=>v.arrow===arrow))expected[0]+=other.member.tangent[0]*other.member.strength,expected[1]+=other.member.tangent[1]*other.member.strength;assert.ok(Math.abs(arrow.vector[0]-expected[0]*27)<1e-9);assert.ok(Math.abs(arrow.vector[1]-expected[1]*27)<1e-9);}
 const cancellation=overlaps.find(v=>Math.abs(v.vector[1])<Math.max(...v.members.map(m=>Math.abs(m.tangent[1]*m.strength*27)))),memberSum=cancellation&&[0,1].map(axis=>cancellation.members.reduce((sum,m)=>sum+m.strength*m.tangent[axis],0));
 assert.ok(memberSum);assert.ok(Math.abs(memberSum[1])<Math.max(...cancellation.members.map(m=>Math.abs(m.strength*m.tangent[1]))));
 assert.ok(straight.length);
 assert.deepEqual(g.windField([[0,0],[200,0],[0,0]],90),[]);
});
test('wind arrows grow into their local vector window, then tail exits before a blank interval',()=>{
 assert.ok(g.windFrame(240,0).head);assert.ok(!g.windFrame(900,0).head);assert.ok(g.windFrame(900,0).start>0);assert.equal(g.windFrame(1500,0).visible,false);
 const field=g.windField([[0,100],[300,0]],120,undefined,45);assert.ok(new Set(field.map(v=>v.phase)).size>field.length/2);for(let t=2400;t<4800;t+=50)assert.ok(field.some(a=>g.windFrame(t,a.phase).visible));
});
test('public rain, coverage and treatment magnitudes darken their area fields',()=>{
 for(const [type,key,values] of [['heavy_rain','rainIn',[0,.1,.3,.6,1]],['thunderstorm','coverage',[0,.2,.4,.8]],['prescribed_burn','treatedFraction',[0,.2,.6,1]]]){
  let prior=-1;for(const value of values){const shade=g.shadeIntensity({type,[key]:value,ageYears:2});assert.ok(shade>prior);prior=shade;}
 }
 assert.ok(g.shadeIntensity({type:'prescribed_burn',treatedFraction:.6,ageYears:2})>g.shadeIntensity({type:'prescribed_burn',treatedFraction:.6,ageYears:8}));
});
test('rain cell is eligible with at least three visible lightning corners and is omitted with two',()=>{
 const area={bounds:[0,0,200,200]},identity=p=>p,within=p=>p[0]<200&&p[1]<200;
 const full=g.stormGrid(area,identity,identity,within);assert.ok(full.rain.length>0);assert.ok(full.rain.every(c=>c.cornerCount>=3));
 const three=g.stormGrid(area,identity,identity,p=>within(p)&&!(p[0]===40&&p[1]===40));assert.ok(three.rain.some(c=>c.cornerCount===3));
 const two=g.stormGrid(area,identity,identity,p=>within(p)&&p[1]!==40);assert.equal(two.rain.length,0);
});

test('smoothed many-segment paths keep continuous station density and zoomed paths bound work',()=>{
 const path=[[0,0],[600,0]],a=g.windField(path,96,undefined,27),b=g.windField(g.sample(path,48),96,undefined,27);
 assert.equal(a.length,b.length);assert.ok(b.length>20);for(let i=0;i<a.length;i++){assert.ok(Math.hypot(a[i].from[0]-b[i].from[0],a[i].from[1]-b[i].from[1])<1e-7);}
 const zoomed=g.windField([[-1e7,100],[1e7,100]],96,undefined,27,[0,0,800,600]);assert.ok(zoomed.length>20&&zoomed.length<=1200);assert.ok(zoomed.every(v=>v.from[0]>-100&&v.to[0]<900));
 assert.ok(g.windField([[0,0],[1e7,0]],240,undefined,8).length<=1200);
});

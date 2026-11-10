const test=require('node:test'),assert=require('node:assert/strict'),g=require('../assets/counterfactual-drawing.js');
const centreLane=field=>{const lane=field.reduce((best,arrow)=>!best||Math.abs(arrow.lane)<Math.abs(best)?arrow.lane:best,undefined);return field.filter(arrow=>arrow.lane===lane);};
const pathLane=(field,lane=0)=>field.filter(arrow=>arrow.pathLane===lane);
test('smooth preserves endpoints, copies input and bounds output size',()=>{const p=Array.from({length:1000},(_,i)=>[i,Math.sin(i)*10]),before=JSON.stringify(p),s=g.smooth(p);assert.deepEqual(s[0],p[0]);assert.deepEqual(s.at(-1),p.at(-1));assert.ok(s.length<=512);assert.equal(JSON.stringify(p),before)});
test('samples equal arc positions across corners rather than equal chords',()=>{assert.deepEqual(g.sample([[0,0],[10,0],[10,10]],6),[[0,0],[4,0],[8,0],[10,2],[10,6],[10,10]]);assert.equal(g.sample([[0,0],[1,1]],6).length,6)});
test('wind field follows local tangent and tapers response at lateral edges',()=>{
 const path=[[0,0],[1800,0]],low=g.windField(path,96,undefined,12),high=g.windField(path,96,undefined,58),length=v=>Math.hypot(v.to[0]-v.from[0],v.to[1]-v.from[1]);
 assert.ok(low.length&&high.length);for(const arrow of low)assert.ok(arrow.to[0]>arrow.from[0]);
 const centreLength=field=>pathLane(field)[0].laneSpacing-5;
 assert.ok(Math.abs(centreLength(low)-12)<1e-9);assert.ok(Math.abs(centreLength(high)-58)<1e-9);
 assert.ok(centreLane(g.windField([[0,200],[300,0]],120)).every(v=>v.to[0]>v.from[0]&&v.to[1]<v.from[1]));
 const edge=low.filter(v=>v.pathLane!==0),centre=pathLane(low);assert.ok(edge.length);assert.ok(edge.every(v=>length(v)<length(centre[0])));
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
  const field=g.windField(path,96,undefined,mph),centre=pathLane(field);
  assert.ok(centre.length>1);assert.equal(new Set(field.map(v=>v.id)).size,field.length);
  for(const arrow of centre){assert.ok(Math.abs(length(arrow)-mph)<1e-9);assert.ok(Math.abs(arrow.vector[1])<1e-9);}
 }
 const low=g.windField(path,96,undefined,12),high=g.windField(path,96,undefined,58),centreLow=pathLane(low),centreHigh=pathLane(high);
 assert.ok(centreLow.length>centreHigh.length);assert.ok(Math.min(...centreHigh.map(length))>Math.max(...centreLow.map(length)));
 for(const width of widths){const counts=count(width);for(let i=1;i<counts.length;i++)assert.ok(counts[i]<=counts[i-1]);}
 for(const width of widths){const field=g.windField(path,width),pitches=[...new Set(pathLane(field).map(a=>a.laneGap+a.strength*27))];assert.deepEqual(pitches,[32]);}
 const stations=pathLane(g.windField(path,96,undefined,27)).map(a=>a.station);
 for(const width of widths)assert.deepEqual(pathLane(g.windField(path,width,undefined,27)).map(a=>a.station),stations);
 for(const arrow of [...low,...high])assert.ok(Math.abs(length(arrow)-Math.hypot(...arrow.vector))<1e-9);
});
test('straight-lane arrows use their actual local vector plus a five-pixel gap',()=>{
 for(const speed of [12,27,45,58]){const pathLength=speed+5+Math.ceil(1100/24)*24+24,field=g.windField([[0,0],[pathLength,0]],96,undefined,speed),centre=pathLane(field);assert.ok(centre.length>1);for(let i=1;i<centre.length;i++){const previous=centre[i-1],current=centre[i];assert.ok(Math.abs(current.from[0]-previous.to[0]-5)<1e-9);assert.equal(current.laneGap,5);assert.ok(Math.abs(current.laneSpacing-speed-5)<1e-9);}assert.ok(centre.every(a=>a.to[0]<=pathLength));}
});
test('acute overlap adds unit directions with bounded local speed',()=>{
 const acutePath=[[0,0],[100,60],[200,0]],acute=g.windField(acutePath,80),straight=g.windField([[0,0],[200,0]],80),overlaps=acute.filter(v=>v.contributors>1&&v.vector[0]>0);
 assert.ok(overlaps.length>=2);assert.ok(overlaps.some(v=>Math.abs(v.vector[1])<Math.max(...v.members.map(m=>Math.abs(m.tangent[1])))*27));
 for(const arrow of acute){assert.ok(Math.abs(arrow.vector[0]-(arrow.to[0]-arrow.from[0]))<1e-9);assert.ok(Math.abs(arrow.vector[1]-(arrow.to[1]-arrow.from[1]))<1e-9);}
 assert.ok(straight.length);assert.ok(overlaps.every(arrow=>Math.hypot(...arrow.vector)<=Math.max(...arrow.members.map(member=>member.speedAt))+1e-9));
 for(const arrow of overlaps){const sum=[0,1].map(axis=>arrow.members.reduce((total,member)=>total+member.tangent[axis]*member.strength,0)),norm=Math.hypot(...sum),expected=Math.max(...arrow.members.map(member=>member.strength))*27;assert.ok(Math.abs(arrow.strength-expected/27)<1e-9);assert.ok(Math.abs(Math.hypot(...arrow.vector)-expected)<1e-9);assert.ok(arrow.vector.every((value,axis)=>Math.abs(value-sum[axis]/norm*expected)<1e-9));}
 const tangent=[.6,.8],strength=.7,overlapDirection=([x,y])=>x===0&&y===0?[0,0]:[x,y].map(value=>value/Math.hypot(x,y)),cancel=[0,0];
 for(const sign of [1,-1]){const direction=overlapDirection([tangent[0]*sign*strength,tangent[1]*sign*strength]);for(let axis=0;axis<2;axis++)cancel[axis]+=direction[axis]*strength;}
 assert.ok(Math.hypot(...cancel)<1e-9);
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
 const path=[[0,600],[300,300],[600,0]],a=g.windField(path,96,undefined,27),b=g.windField(g.sample(path,48),96,undefined,27);
 assert.equal(a.length,b.length);assert.ok(b.length>20);for(let i=0;i<a.length;i++){assert.ok(Math.hypot(a[i].from[0]-b[i].from[0],a[i].from[1]-b[i].from[1])<1e-7);}
 const zoomed=g.windField([[-1e7,100],[1e7,100]],96,undefined,27,[0,0,800,600]);assert.ok(zoomed.length>20&&zoomed.length<=1200);assert.ok(zoomed.every(v=>v.from[0]>-100&&v.to[0]<900));
 assert.ok(g.windField([[0,0],[1e7,0]],240,undefined,8).length<=1200);
});

test('turning overlap glyphs do not cross or duplicate the normalized field',()=>{
 const field=g.windField([[0,100],[200,100],[70,130],[200,170]],160,undefined,58),cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
 assert.ok(field.some(a=>a.contributors>1));for(let i=0;i<field.length;i++)for(let j=i+1;j<field.length;j++){const a=field[i],b=field[j];if(a.contributors<2&&b.contributors<2)continue;assert.ok(!(cross(a.from,a.to,b.from)*cross(a.from,a.to,b.to)<-1e-6&&cross(b.from,b.to,a.from)*cross(b.from,b.to,a.to)<-1e-6));}
});

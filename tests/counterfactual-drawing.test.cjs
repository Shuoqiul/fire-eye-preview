const test=require('node:test'),assert=require('node:assert/strict'),g=require('../assets/counterfactual-drawing.js');
const centreLane=field=>field.filter(arrow=>Math.abs(arrow.lane)<1e-8);
const pathLane=(field,lane=0)=>field.filter(arrow=>Math.abs(arrow.pathLane-lane)<1e-8);
const curveLength=points=>points.reduce((sum,p,i)=>sum+(i?Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1]):0),0);
const average=values=>values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);
const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
const crosses=(a,b)=>{
 for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++){
  const p0=a[i-1],p1=a[i],q0=b[j-1],q1=b[j],den=(p1[0]-p0[0])*(q1[1]-q0[1])-(p1[1]-p0[1])*(q1[0]-q0[0]);if(Math.abs(den)<1e-9)continue;
  const rx=q0[0]-p0[0],ry=q0[1]-p0[1],u=(rx*(q1[1]-q0[1])-ry*(q1[0]-q0[0]))/den,v=(rx*(p1[1]-p0[1])-ry*(p1[0]-p0[0]))/den;
  if(u>.001&&u<.999&&v>.001&&v<.999)return true;
 }
 return false;
};
test('smooth preserves endpoints, copies input and bounds output size',()=>{const p=Array.from({length:1000},(_,i)=>[i,Math.sin(i)*10]),before=JSON.stringify(p),s=g.smooth(p);assert.deepEqual(s[0],p[0]);assert.deepEqual(s.at(-1),p.at(-1));assert.ok(s.length<=512);assert.equal(JSON.stringify(p),before)});
test('samples equal arc positions across corners rather than equal chords',()=>{assert.deepEqual(g.sample([[0,0],[10,0],[10,10]],6),[[0,0],[4,0],[8,0],[10,2],[10,6],[10,10]]);assert.equal(g.sample([[0,0],[1,1]],6).length,6)});
test('wind field follows local tangent and tapers response at lateral edges',()=>{
 const path=[[0,0],[1800,0]],low=g.windField(path,96,undefined,12),high=g.windField(path,96,undefined,58);
 assert.ok(low.length&&high.length);assert.ok(low.every(v=>v.major===false||v.points.length>=4));assert.ok(high.every(v=>v.points.every((p,i,a)=>!i||p[0]>a[i-1][0])));
 const edge=low.filter(v=>Math.abs(v.pathLane)>5),centre=pathLane(low);assert.ok(edge.length);assert.ok(average(edge.map(v=>v.glyphLength))<average(centre.map(v=>v.glyphLength)));
});
test('distance field preserves holes and has stronger interior',()=>{const m=new Uint8Array(49);for(let y=1;y<6;y++)for(let x=1;x<6;x++)m[y*7+x]=1;const d=g.distanceField(m,7,7);assert.ok(d[24]>d[8]);m[24]=0;assert.equal(g.distanceField(m,7,7)[24],0)});
test('dilation and erosion honour radius and disconnected shapes',()=>{const m=new Uint8Array(81);m[40]=1;const a=g.expandMask(m,9,9,1),b=g.expandMask(m,9,9,3);assert.equal(a[41],1);assert.equal(a[42],0);assert.equal(b[43],1);assert.equal(g.expandMask(b,9,9,-1)[40],1);assert.equal(g.expandMask(m,9,9,-1)[40],0)});
test('coast follows viewpoint, zoom and per-component 1.5 degree limit',()=>{const west=g.coastalTrack([-120,38],0),east=g.coastalTrack([-73,40],0);assert.ok(west[0][0]<-122);assert.ok(east[0][0]>-75);for(const p of [west,east])for(let i=1;i<6;i++){assert.ok(Math.abs(p[i][0]-p[i-1][0])<=1.5);assert.ok(Math.abs(p[i][1]-p[i-1][1])<=1.5);}const z=g.coastalTrack([-120,38],10);assert.ok(Math.hypot(z[1][0]-z[0][0],z[1][1]-z[0][1])<.1)});
test('representative default tracks remain offshore against installed land geometry',()=>{
 const fs=require('node:fs'),path=require('node:path'),model=require('../assets/counterfactual-engine.js'),land=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/land.geojson')));
 const onLand=p=>land.features.some(f=>model.inside(f.geometry.coordinates[0],...p)&&!f.geometry.coordinates.slice(1).some(r=>model.inside(r,...p)));
 for(const center of [[-120,38],[-74,40],[-80,25],[-124,48],[-96,38]])for(const p of g.coastalTrack(center,0))assert.equal(onLand(p.slice(0,2)),false);
});
test('wind presets produce longer, faster and sparser curved glyphs',()=>{
 const path=[[0,0],[3000,0]],lengths=[8,12,18,27,45,58].map(speed=>({speed,field:g.windField(path,96,undefined,speed)})),centres=lengths.map(({field})=>pathLane(field));
 for(let index=0;index<lengths.length;index++)assert.equal(lengths[index].field.length>0,true);
 for(let index=1;index<lengths.length;index++){assert.ok(average(centres[index].map(v=>v.glyphLength))>average(centres[index-1].map(v=>v.glyphLength)));assert.ok(centres[index].length<centres[index-1].length);}
 for(const {field} of lengths){assert.ok(field.length<=1200);assert.equal(new Set(field.map(v=>v.id)).size,field.length);assert.ok(field.every(v=>v.points.length>=4&&v.points.flat().every(Number.isFinite)&&v.arcLength>0&&v.speedFactor>0));}
});

test('width adds lateral flows while preserving centre stations',()=>{
 const path=[[0,0],[3000,0]],widths=[40,96],centres=widths.map(width=>g.windField(path,width,undefined,27).filter(v=>Math.abs(v.lane)<1e-8&&v.station<400).map(v=>v.station));
 for(const other of centres.slice(1))assert.deepEqual(other,centres[0]);
 const narrow=g.windField(path,60,undefined,27),wide=g.windField(path,96,undefined,27);
 assert.ok(wide.length>narrow.length);assert.ok(wide.some(v=>Math.abs(v.lane)>27));assert.ok(wide.every(v=>Math.abs(v.lane)<=48));
});

test('rounded sharp and hairpin guides produce finite, noncrossing curve glyphs',()=>{
 const paths=[[[0,0],[100,60],[200,0]],[[0,32],[160,32],[0,32]],[[0,0],[80,80],[0,160],[80,240]]];
 for(const path of paths)for(const speed of [8,27,58]){const field=g.windField(path,160,undefined,speed);assert.ok(field.length>0);assert.ok(field.every(v=>v.points.length>=4&&v.points.flat().every(Number.isFinite)));
  for(let i=0;i<field.length;i++)for(let j=i+1;j<field.length;j++){const a=field[i],b=field[j],boxA=[Math.min(...a.points.map(p=>p[0])),Math.min(...a.points.map(p=>p[1])),Math.max(...a.points.map(p=>p[0])),Math.max(...a.points.map(p=>p[1]))],boxB=[Math.min(...b.points.map(p=>p[0])),Math.min(...b.points.map(p=>p[1])),Math.max(...b.points.map(p=>p[0])),Math.max(...b.points.map(p=>p[1]))];
   if(boxA[2]<boxB[0]-5||boxB[2]<boxA[0]-5||boxA[3]<boxB[1]-5||boxB[3]<boxA[1]-5)continue;
   assert.equal(crosses(a.points,b.points),false,'glyphs cross at hairpin');
  }}
});

test('curved streamlines are longer and faster outside a bend',()=>{
 const line=g.traceWindCenterline([[0,0],[100,60],[200,0]]),glyph=(offset,direction)=>g.traceWindPolyline({line,station:43,direction,lane:Math.round(offset/20),index:0,offset,length:30,primary:Math.round(offset/20)===0},160);
 const inside=glyph(-20,1),outside=glyph(20,1),before=glyph(-20,-1),after=glyph(20,-1),length=curveLength,span=points=>Math.hypot(points.at(-1)[0]-points[0][0],points.at(-1)[1]-points[0][1]);
 assert.ok(length(outside)>length(inside));assert.ok(span(outside)>span(inside));assert.ok(inside.length>0&&outside.length>0);assert.ok(outside.some((p,i)=>i&&(p[0]!==outside[i-1][0]||p[1]!==outside[i-1][1])));
});
test('wide straight guides keep every lane straight, parallel and positionally distinct',()=>{
 const guide=[[0,0],[1800,0]],denseGuide=g.sample(guide,48),jittered=denseGuide.map(([x,y],i)=>[x,y+(i>0&&i<47?Math.sin(i*2)*3:0)]);
 for(const path of [guide,denseGuide,jittered])for(const speed of [8,27,45,58]){
  const field=g.windField(path,240,undefined,speed),lanes=[...new Set(field.map(v=>v.lane))];
  assert.ok(lanes.some(lane=>Math.abs(lane)>110));
  assert.ok(field.every(v=>v.to[0]>v.from[0]&&v.points.every(p=>Math.abs(p[1]-v.from[1])<.01)));
  assert.ok(lanes.length>=5);assert.equal(new Set(field.map(v=>v.from.slice(0,2).join(','))).size,field.length);
 }
 const reversing=g.traceWindCenterline([[0,0],[200,0],[40,1],[300,0]]);
 assert.ok(reversing.length>400);
 const track=g.windField(guide,240,undefined,58).filter(v=>v.station>700&&v.station<1000),outer=track.filter(v=>Math.abs(v.lane)===120),centre=track.filter(v=>v.lane===0);
 assert.ok(outer.length&&centre.length);assert.ok(outer.every(v=>v.arcLength<58+1e-8));assert.ok(average(outer.map(v=>v.arcLength))<average(centre.map(v=>v.arcLength)));
});
test('wind frames retain eased growth, blank phases and staggered phases',()=>{
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
 assert.ok(a.length>20&&b.length>20);assert.ok(a.every(v=>v.points.flat().every(Number.isFinite)));assert.ok(b.every(v=>v.points.flat().every(Number.isFinite)));
 const zoomed=g.windField([[-2000,100],[2000,100]],96,undefined,27,[0,0,800,600]);assert.ok(zoomed.length>0&&zoomed.length<=1200);assert.ok(zoomed.every(v=>v.points.every(q=>q[0]>-200&&q[0]<1000)));
 const long=g.windField([[0,0],[1e7,0]],240,undefined,8);assert.ok(long.length>0&&long.length<=1200);
});

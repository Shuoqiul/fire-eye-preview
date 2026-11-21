const test=require('node:test'),assert=require('node:assert/strict'),g=require('../assets/counterfactual-drawing.js');
const centreLane=field=>field.filter(arrow=>Math.abs(arrow.lane)<1e-8);
const pathLane=(field,lane=0)=>field.filter(arrow=>Math.abs(arrow.pathLane-lane)<1e-8);
const curveLength=points=>points.reduce((sum,p,i)=>sum+(i?Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1]):0),0);
const average=values=>values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);
const pointSegmentDistance=(point,p,q)=>{
 const dx=q[0]-p[0],dy=q[1]-p[1],len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((point[0]-p[0])*dx+(point[1]-p[1])*dy)/len)):0;
 return Math.hypot(point[0]-p[0]-dx*t,point[1]-p[1]-dy*t);
};
const segmentDistance=(p,q,r,s)=>{
 const den=(q[0]-p[0])*(s[1]-r[1])-(q[1]-p[1])*(s[0]-r[0]);
 if(den){const t=((r[0]-p[0])*(s[1]-r[1])-(r[1]-p[1])*(s[0]-r[0]))/den,u=((r[0]-p[0])*(q[1]-p[1])-(r[1]-p[1])*(q[0]-p[0]))/den;if(t>=0&&t<=1&&u>=0&&u<=1)return 0;}
 return Math.min(pointSegmentDistance(p,r,s),pointSegmentDistance(q,r,s),pointSegmentDistance(r,p,q),pointSegmentDistance(s,p,q));
};
const curveClearance=(a,b)=>{
 let minimum=Infinity;
 for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++)minimum=Math.min(minimum,segmentDistance(a[i-1],a[i],b[j-1],b[j]));
 return minimum;
};
const headClearance=(a,b)=>{
 const head=arrow=>{
  const p=arrow.points.at(-1),q=arrow.points.at(-2),angle=Math.atan2(p[1]-q[1],p[0]-q[0]),reach=Math.min(6,Math.max(2,arrow.glyphLength*.23));
  return [-.47,.47].map(offset=>[p,[p[0]-reach*Math.cos(angle+offset),p[1]-reach*Math.sin(angle+offset)]]);
 };
 let minimum=Infinity;
 for(const [p,q] of head(a))for(const [r,s] of head(b))minimum=Math.min(minimum,segmentDistance(p,q,r,s));
 return minimum;
};
const fieldClearance=field=>{
 let minimum=Infinity;
 for(let i=0;i<field.length;i++)for(let j=i+1;j<field.length;j++){
  const a=field[i].bounds,b=field[j].bounds;
  if(a[2]<=b[0]-8||b[2]<=a[0]-8||a[3]<=b[1]-8||b[3]<=a[1]-8)continue;
  minimum=Math.min(minimum,curveClearance(field[i].points,field[j].points));
 }
 return minimum;
};
const fieldGaps=field=>{
 const lanes=new Map();
 for(const arrow of field){
  if(!lanes.has(arrow.lane))lanes.set(arrow.lane,[]);lanes.get(arrow.lane).push(arrow.station);
 }
 return [...lanes.values()].flatMap(stations=>{
  const sorted=stations.sort((a,b)=>a-b);return sorted.slice(1).map((station,i)=>station-sorted[i]);
 });
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
 const fs=require('node:fs'),path=require('node:path'),engine=require('../assets/counterfactual-engine.js'),model=engine.api||engine,land=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/land.geojson')));
 const onLand=p=>land.features.some(f=>model.inside(f.geometry.coordinates[0],...p)&&!f.geometry.coordinates.slice(1).some(r=>model.inside(r,...p)));
 for(const center of [[-120,38],[-74,40],[-80,25],[-124,48],[-96,38]])for(const p of g.coastalTrack(center,0))assert.equal(onLand(p.slice(0,2)),false);
});
test('wind presets produce longer, faster and sparser curved glyphs',()=>{
 const path=[[0,0],[3000,0]],lengths=[8,12,18,27,45,58].map(speed=>({speed,field:g.windField(path,96,undefined,speed)})),centres=lengths.map(({field})=>pathLane(field).sort((a,b)=>a.station-b.station));
 for(const {field,speed} of lengths){assert.ok(field.length>0);const lane=pathLane(field).sort((a,b)=>a.station-b.station);for(let i=1;i<lane.length;i++)assert.ok(lane[i].station-lane[i-1].station>=speed-1e-6);assert.ok(field.length<=1200);assert.equal(new Set(field.map(v=>v.id)).size,field.length);assert.ok(field.every(v=>v.points.length>=4&&v.points.flat().every(Number.isFinite)&&v.arcLength>0&&v.speedFactor>0));}
 assert.ok(centres.at(-1).length<centres[0].length);
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
   if(boxA[2]<=boxB[0]-4.5||boxB[2]<=boxA[0]-4.5||boxA[3]<=boxB[1]-4.5||boxB[3]<=boxA[1]-4.5)continue;
   assert.ok(curveClearance(a.points,b.points)>=4.5,'glyphs keep shaft clearance at sharp guides');
  }}
});
test('segment clearance catches endpoint and collinear tails missed by proper crossings',()=>{
 assert.equal(segmentDistance([0,0],[10,0],[15,0],[30,0]),5,'collinear tail');
 assert.equal(segmentDistance([0,0],[10,0],[4,5],[20,5]),5,'near-miss endpoint');
 assert.equal(segmentDistance([0,0],[10,0],[15,5],[30,5]),Math.hypot(5,5),'separated endpoints');
 assert.equal(segmentDistance([0,0],[10,0],[5,5],[15,5]),5,'collinear overlap');
 assert.equal(segmentDistance([0,0],[10,0],[20,0],[30,0]),10,'collinear gap');
 assert.equal(segmentDistance([0,0],[10,0],[0,4],[10,4]),4,'parallel lines');
 assert.equal(segmentDistance([0,0],[10,0],[5,-3],[5,3]),0,'crossing');
});
test('acute fields retain visible arrows with bend clearance',()=>{
 const field=g.windField([[-80,90],[0,0],[80,90]],200,undefined,27);
 assert.ok(field.length>0&&field.length<1200);
 assert.ok(field.some(v=>v.clearance===8));
 assert.ok(fieldClearance(field)>=6);
 field.forEach((a,i)=>field.slice(i+1).forEach(b=>assert.ok(headClearance(a,b)>=4.5)));
});

test('curved streamlines are longer and faster outside a bend',()=>{
 const line=g.traceWindCenterline([[0,0],[100,60],[200,0]]),glyph=(offset,direction)=>g.traceWindPolyline({line,station:43,direction,lane:Math.round(offset/20),index:0,offset,length:30,primary:Math.round(offset/20)===0},160);
 for(const direction of [-1,1])for(const bend of [-1,1]){
  const inner=glyph(bend*20,direction),outer=glyph(-bend*20,direction),span=points=>Math.hypot(points.at(-1)[0]-points[0][0],points.at(-1)[1]-points[0][1]);
  assert.notEqual(span(inner),span(outer),'bend side changes shaft length');assert.ok(outer.some((p,i)=>i&&(p[0]!==outer[i-1][0]||p[1]!==outer[i-1][1])));
 }
});
test('wide straight guides keep every lane straight, parallel and positionally distinct',()=>{
 const guide=[[0,0],[1800,0]],denseGuide=g.sample(guide,48),jittered=denseGuide.map(([x,y],i)=>[x,y+(i>0&&i<47?Math.sin(i*2)*3:0)]);
 for(const path of [guide,denseGuide,jittered])for(const speed of [8,27,45,58]){
  const field=g.windField(path,240,undefined,speed),lanes=[...new Set(field.map(v=>v.lane))];
  assert.ok(lanes.some(lane=>Math.abs(lane)>110));
  assert.ok(field.every(v=>v.to[0]>v.from[0]&&v.points.every(p=>Math.abs(p[1]-v.from[1])<.01)));
  assert.ok(fieldClearance(field)>=4.5);
  assert.ok(field.every(v=>v.clearance===6));
  assert.ok(lanes.length>=5);assert.equal(new Set(field.map(v=>v.from.slice(0,2).join(','))).size,field.length);
 }
 const reversing=g.traceWindCenterline([[0,0],[200,0],[40,1],[300,0]]);
 assert.ok(reversing.length>400);
 const track=g.windField(guide,240,undefined,58).filter(v=>v.station>700&&v.station<1000),outer=track.filter(v=>Math.abs(v.lane)===120),centre=track.filter(v=>v.lane===0);
 assert.ok(outer.length&&centre.length);assert.ok(outer.every(v=>v.arcLength<58+1e-8));assert.ok(average(outer.map(v=>v.arcLength))<average(centre.map(v=>v.arcLength)));
});
test('strong maximum-width wind fields keep distinct flowing glyph clearance within the cap',()=>{
 const paths=[[[0,0],[400,0],[600,-300]],[[0,0],[350,200],[650,-250]],[[200,800],[0,400],[250,0],[520,280]]];
 for(const path of paths){
  const started=performance.now(),field=g.windField(path,240,undefined,58),elapsed=performance.now()-started;
  assert.ok(field.length>0&&field.length<=1200);
  assert.ok(fieldClearance(field)>=4.5);
  assert.ok(field.filter(v=>v.clearance===8).length>20);
  assert.ok(field.some(v=>Math.abs(v.lane)>110));
  assert.ok(elapsed<1500,'maximum-width acute field stays interactive: '+elapsed.toFixed(1)+'ms');
 }
});
test('downstream arrow begins on arrival of upstream head, with continuous motion and alternating lanes',()=>{
 const growth=g.windFrame(240),flowing=g.windFrame(1050),arrival=g.windFrame(1200),departing=g.windFrame(1550);
 assert.ok(growth.head>0&&growth.start===0);
 assert.ok(flowing.start>0&&flowing.end<1);
 assert.equal(arrival.end,1);assert.ok(departing.start>arrival.start&&departing.end===1);
 assert.equal(g.windFrame(1199,.5).visible,false);
 assert.equal(g.windFrame(1201,.5).visible,true);
 for(const speed of [12,27,58]){
  const field=g.windField([[0,0],[1800,0]],240,undefined,speed);
  for(const lane of new Set(field.map(a=>a.lane))){
   const arrows=field.filter(a=>a.lane===lane).sort((a,b)=>a.station-b.station);
   assert.ok(arrows.length>=18);
   for(let i=1;i<arrows.length;i++)assert.ok(Math.abs(Math.abs(arrows[i].phase-arrows[i-1].phase)-.5)<1e-10);
   for(let t=0;t<2400;t+=20)assert.ok(arrows.some(a=>g.windFrame(t,a.phase).end-g.windFrame(t,a.phase).start>.1));
  }
 }
});
test('dense sharp turns keep complete moving glyphs and move rejected glyphs with bend speed ordering',()=>{
 for(const path of [[[0,0],[240,-180],[480,0]],[[0,0],[-240,-180],[-480,0]],[[100,600],[220,330],[420,300]]]){
  for(const [speed,width] of [[27,160],[58,240]]){
   const field=g.windField(path,width,undefined,speed);
   for(let time=1200;time<2400;time+=16)assert.ok(g.windVisibility(field,time).filter(item=>item.frame.end-item.frame.start>=.1).length>0,'curved chain retains displayed glyphs');
   assert.ok(field.length>0&&field.length<=1200,'dense turns retain flowing glyphs');
   assert.ok(g.windVisibility(field,1800).length>0);
   assert.ok(fieldClearance(field)>=4.5,'resolved turn glyphs retain shaft clearance');
  }
 }
});
test('tight bend retries retain local stations and speed ordering',()=>{
 for(const turn of [-1,1]){
  const path=[[0,300],[300+turn*30,0],[600,300]],field=g.windField(path,160,undefined,27),lane=field.filter(arrow=>arrow.lane===24).sort((a,b)=>a.station-b.station);
  assert.ok(lane.length>=12);assert.ok(field.some(arrow=>arrow.retry),'crowded bend resolves by shifted retry geometry');
  const firstGap=Math.max(...lane.slice(1).map((arrow,i)=>arrow.station-lane[i].station));assert.ok(firstGap<=130,'crowded bend retains local coverage');
  const inner=field.filter(arrow=>arrow.lane===24&&arrow.station>135&&arrow.station<225),outer=field.filter(arrow=>arrow.lane===-24&&arrow.station>135&&arrow.station<225);
  assert.ok(average(inner.map(arrow=>arrow.speedFactor))<average(outer.map(arrow=>arrow.speedFactor)),'both handed bends keep the inner side slower');
 }
});
test('public rain, coverage and treatment magnitudes darken their area fields',()=>{
 for(const [type,key,values] of [['heavy_rain','rainIn',[0,.1,.3,.6,1]],['thunderstorm','coverage',[0,.2,.4,.8]],['prescribed_burn','treatedFraction',[0,.2,.6,1]]]){
  let prior=-1;for(const value of values){const shade=g.shadeIntensity({type,[key]:value,ageYears:2});assert.ok(shade>prior);prior=shade;}
 }
 assert.ok(g.shadeIntensity({type:'prescribed_burn',treatedFraction:.6,ageYears:2})>g.shadeIntensity({type:'prescribed_burn',treatedFraction:.6,ageYears:8}));
});
test('guide extending beyond a narrow high-zoom viewport retains lateral arrow coverage',()=>{
 const guide=[[150,620],[400,420],[700,400]],view=[350,200,750,500],field=g.windField(guide,180,undefined,58,view,{innerDensity:true},8);
 assert.ok(field.length>=8);
 const visible=field.flatMap(a=>a.points).filter(p=>p[0]>=view[0]&&p[0]<=view[2]&&p[1]>=view[1]&&p[1]<=view[3]);
 assert.ok(visible.length>0);assert.ok(new Set(field.map(a=>Math.round(a.lane))).size>=3);
});
test('screen pointer samples keep straight bearings while preserving the full guide geometry',()=>{
 const stroke=Array.from({length:61},(_,i)=>[100+i*10,300-i*2]),line=g.traceWindCenterline(stroke);
 assert.equal(line.points.length,2);assert.ok(Math.abs((line.points[1][1]-line.points[0][1])/(line.points[1][0]-line.points[0][0])-(-.2))<.001);
});
test('inside a wide bend outer streamline travels farther than inner streamline',()=>{
 for(const turn of [-1,1]){const field=g.windField([[0,300],[210+turn*60,80],[420,300]],160,undefined,27),lane24=field.filter(a=>a.lane===24&&a.station>100&&a.station<260),laneMinus=field.filter(a=>a.lane===-24&&a.station>100&&a.station<260);assert.ok(lane24.length&&laneMinus.length);assert.ok(average(lane24.map(a=>a.speedFactor))!==average(laneMinus.map(a=>a.speedFactor)));}
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
test('zoom winding guides keep local arrow spacing and propagate turns across clearance gaps',()=>{
 const guide=g.sample([[0,600],[260,430],[480,350],[830,420]],96),field=g.windField(guide,350,undefined,58,[0,0,1000,900]);
 const lane=field.filter(v=>Math.abs(v.lane)===48).sort((a,b)=>a.station-b.station),gaps=lane.slice(1).map((v,i)=>v.station-lane[i].station);
 assert.ok(lane.length>=8);assert.ok(Math.max(...gaps)<=130,'inner lane retains coverage after clearance pruning: '+Math.max(...gaps).toFixed(1));
 const directions=field.flatMap(v=>v.points.slice(1).map((p,i)=>[v.points[i],p])),samples=directions.filter(([[x1,y1],[x2,y2]])=>Math.hypot(x2-x1,y2-y1)>.5);
 const angleSamples={},continuous=samples.every(([[x1,y1],[x2,y2]])=>{
  const x=Math.round(x1/6)*6,y=Math.round(y1/6)*6,angle=Math.atan2(y2-y1,x2-x1),prior=angleSamples[x+','+y];
  angleSamples[x+','+y]=angle;return prior===undefined||Math.abs(Math.atan2(Math.sin(angle-prior),Math.cos(angle-prior)))<Math.PI/12;
 });
 assert.ok(continuous,'neighbouring shafts follow the same local direction');
 assert.ok(fieldClearance(field)>=4.5);
});
test('wide off-screen centreline selects bounded signed lanes that reach the viewport',()=>{
 const view=[0,0,900,600],guide=[[60,-800],[960,-800]],field=g.windField(guide,2500,undefined,58,view,{},5),points=field.flatMap(a=>a.points);
 assert.ok(field.length>0&&field.length<=1200);
 assert.ok(new Set(field.map(a=>a.lane)).size>=8);
 assert.ok(points.some(([x,y])=>x>=view[0]&&x<=view[2]&&y>=view[1]&&y<=view[3]));
 assert.ok(field.every(a=>a.lane>=-1250&&a.lane<=1250),'signed lanes remain inside the real projected half-width');
 const centered=g.windField([[60,300],[960,300]],2500,undefined,58,view,{},5);assert.deepEqual([...new Set(centered.map(a=>a.lane))].slice(0,2),[0,24],'centered wide corridors retain the original centre-first placement');
});

test('deep zoom clips each lateral lane before spending its arrow budget',()=>{
 const viewport=[0,0,1100,700],path=[[-170000,-14500],[150000,-14500]],width=35000;
 const field=g.windField(path,width,undefined,45,viewport,{},16);
 const inside=field.filter(a=>a.points.some(([x,y])=>x>=0&&x<=1100&&y>=0&&y<=700));
 assert.ok(inside.length>70, `displayed ${inside.length} arrows`);
 assert.ok(new Set(inside.map(a=>a.lane)).size>15);
 assert.ok(inside.some(a=>a.from[0]<150)&&inside.some(a=>a.to[0]>950));
});
test('acute hairpin, rotation and mirror use one continuous short-arc heading field',()=>{
 const guide=[[150,300],[730,340],[150,440]];
 for(const angle of [10,15,19]){
  const endpoint=[580-580*Math.cos(angle*Math.PI/180),580*Math.sin(angle*Math.PI/180)],line=[[0,0],[580,0],endpoint];
  for(const rotation of [0,Math.PI/7,1.7])for(const mirror of [1,-1]){
   const c=Math.cos(rotation),s=Math.sin(rotation),rotated=line.map(([x,y])=>[c*x-s*y*mirror,s*x+c*y*mirror]),field=g.createWorldWindField(rotated,200,27);
   for(const step of [5,20]){
    for(let y=-420;y<420;y+=step*2)for(let x=-420;x<1100;x+=step*2){
     const a=field.sample(x,y);if(!a)continue;
     for(const [dx,dy] of [[step,0],[0,step],[-step,0]]){
      const b=field.sample(x+dx,y+dy);if(!b)continue;
      const change=Math.abs(Math.atan2(Math.sin(Math.atan2(b.heading[1],b.heading[0])-Math.atan2(a.heading[1],a.heading[0])),Math.cos(Math.atan2(b.heading[1],b.heading[0])-Math.atan2(a.heading[1],a.heading[0]))));
      assert.ok(change<Math.PI*.5,`${angle}-degree hairpin, rotation ${rotation.toFixed(2)}, mirror ${mirror}, ${step}px: ${(change*180/Math.PI).toFixed(1)}-degree local jump`);
     }
    }
   }
  }
  const fold=[[0,0],[580,0],[580-580*Math.cos(angle*Math.PI/180),580*Math.sin(angle*Math.PI/180)]],foldField=g.createWorldWindField(fold,200,27);
  assert.ok(foldField.maxTurn<Math.PI-angle*Math.PI/180+1e-8,'acute turn advances in the intended short direction');
 }
 const narrow=g.createWorldWindField(guide,120,45),wide=g.createWorldWindField(guide,200,45),inside=[[300,340],[420,350],[540,330],[690,395]];
 for(const point of inside){
  assert.ok(narrow.sample(...point)&&wide.sample(...point),'width increments expand symmetrically instead of changing the centreline');
  const a=narrow.sample(...point),b=wide.sample(...point),angleA=Math.atan2(a.heading[1],a.heading[0]),angleB=Math.atan2(b.heading[1],b.heading[0]),turn=Math.abs(Math.atan2(Math.sin(angleB-angleA),Math.cos(angleB-angleA)));
  assert.ok(turn<1e-10,'the same geography keeps an identical field direction as width grows');
 }
 const far=[[300,180],[450,190],[560,170],[700,520]],base=wide.sample(310,380).heading,scaled=g.createWorldWindField(guide.map(([x,y])=>[x*40,y*40]),8000,45),sample=scaled.sample(310*40,380*40);
 assert.ok(Math.abs(sample.heading[0]-base[0])<1e-10&&Math.abs(sample.heading[1]-base[1])<1e-10,'a fourfold camera scale retains ground headings');
 assert.ok(far.every(([x,y])=>!wide.hasPoint(x,y)),'wind absence remains outside the true-width geographic support');
});
test('near-collinear sampled brush reaches stable headings and keeps true support',()=>{
 const guide=Array.from({length:48},(_,i)=>{const t=i/47;return[80+t*840,260+Math.sin(t*Math.PI*7)*3]});
 const field=g.createWorldWindField(guide,240,45),start=guide[0],end=guide.at(-1),chord=Math.hypot(end[0]-start[0],end[1]-start[1]),ux=(end[0]-start[0])/chord,uy=(end[1]-start[1])/chord;
 for(let x=150;x<850;x+=20)for(let y=300;y<430;y+=20){
  const a=field.sample(x,y);if(!a)continue;
  assert.ok(Math.abs(a.heading[0]-ux)<1e-10&&Math.abs(a.heading[1]-uy)<1e-10,'sample jitter does not tilt the drawn heading');
 }
 assert.equal(field.points.length,guide.length,'field retains all original brush coordinates');
 assert.equal(field.sigma,g.createWorldWindField([start,end],240,45).sigma,'direction scale uses the canonical straight guide');
 assert.ok(g.createWorldWindField([[0,0],[600,0]],40,45).sigma>0,'two-point path has a defined direction scale');
 assert.ok(g.createWorldWindField([[0,0],[600,0]],40,45).sample(300,20));
});
test('48-point remeshing retains a genuine hairpin turn without sampling-scale dependence',()=>{
 const guide=[[100,600],[500,600],[450,690]],remeshed=g.sample(guide,48),coarse=g.createWorldWindField(guide,160,27),dense=g.createWorldWindField(remeshed,160,27);
 assert.ok(Math.abs(coarse.sigma-dense.sigma)<coarse.sigma*.03,`guide sigma: ${coarse.sigma}, remeshed: ${dense.sigma}`);
 assert.ok(coarse.sigma>g.createWorldWindField([[100,600],[450,690]],160,27).sigma,'the shared arm length sustains the bend blend');
 const steps=5,region=[];
 for(let y=580;y<690;y+=steps)for(let x=150;x<505;x+=steps){
  const a=coarse.sample(x,y),b=dense.sample(x,y);if(!a||!b)continue;
  const change=Math.abs(Math.atan2(Math.sin(Math.atan2(b.heading[1],b.heading[0])-Math.atan2(a.heading[1],a.heading[0])),Math.cos(Math.atan2(b.heading[1],b.heading[0])-Math.atan2(a.heading[1],a.heading[0]))));
  assert.ok(change<Math.PI*.36,`dense and coarse guide share the local blend: ${change}`);
  if(Math.abs(Math.atan2(b.heading[1],b.heading[0]))>.15)region.push(b);
 }
 assert.ok(region.length>70,'the actual 48-point brush keeps a visible continuous turning region');
 let changes=0;
 for(let y=575;y<690;y+=steps)for(let x=400;x<510;x+=steps){
  const u=dense.sample(x,y);if(!u)continue;for(const [dx,dy] of [[steps,0],[0,steps],[-steps,0]]){const v=dense.sample(x+dx,y+dy);if(!v)continue;
  const change=Math.abs(Math.atan2(Math.sin(Math.atan2(v.heading[1],v.heading[0])-Math.atan2(u.heading[1],u.heading[0])),Math.cos(Math.atan2(v.heading[1],v.heading[0])-Math.atan2(u.heading[1],u.heading[0]))));
  assert.ok(change<Math.PI*.40,'the remeshed hairpin has no local opposing jump');changes++;
  }}
 assert.ok(changes>10);
});
test('crossing sharp legs use one radius-independent heading and turn consistently with width',()=>{
 const legs=[[[-120,90],[120,90],[0,-90]],[[0,90],[0,-90],[425,10]]];
 for(const guide of legs){
  for(const [widths,speed] of [[[40,120],20],[[120,240],58]]){
   const fields=widths.map(width=>g.createWorldWindField(guide,width,speed)),narrow=fields[0],wide=fields[1];
   for(let y=-80;y<81;y+=10)for(let x=-100;x<=100;x+=10){
    const a=narrow.sample(x,y),b=wide.sample(x,y);if(!a||!b)continue;
    const difference=Math.abs(Math.atan2(Math.sin(Math.atan2(b.heading[1],b.heading[0])-Math.atan2(a.heading[1],a.heading[0])),Math.cos(Math.atan2(b.heading[1],b.heading[0])-Math.atan2(a.heading[1],a.heading[0]))));
    assert.ok(difference<1e-10,'width controls the buffer and leaves every overlapping heading unchanged');
   }
   let transitions=0;
   for(let y=-80;y<81;y+=10)for(let x=-100;x<=100;x+=10){
    const a=narrow.sample(x,y);if(!a)continue;
    for(const [dx,dy] of [[10,0],[0,10]]){const b=narrow.sample(x+dx,y+dy);if(!b)continue;const a0=Math.atan2(a.heading[1],a.heading[0]),b0=Math.atan2(b.heading[1],b.heading[0]),change=Math.abs(Math.atan2(Math.sin(b0-a0),Math.cos(b0-a0)));assert.ok(change<Math.PI*.7,'crossing legs use a short local direction change');if(change>.01)transitions++;}
   }
   assert.ok(transitions>4,'the crossing fold retains a visible continuous turning zone');
   const scaled=g.createWorldWindField(guide.map(([x,y])=>[x*30,y*30]),widths[1]*30,speed),sample=narrow.sample(20,30),sampleScaled=scaled.sample(600,900);
   if(sample)assert.ok(Math.abs(sample.heading[0]-sampleScaled.heading[0])<1e-10&&Math.abs(sample.heading[1]-sampleScaled.heading[1])<1e-10,'geographic direction survives camera scale');
  }
 }
});

'use strict';
/* Pure drawing geometry shared by the browser editor and Node checks. */
(function(root){
 const copy=points=>{if(!Array.isArray(points)||points.some(p=>!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])))throw Error('Provide finite coordinate pairs.');return points.map(p=>p.slice(0,2));};
 const distance=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
 const WIND_LIMIT=1200,WIND_GAP=5,WIND_CLEARANCE=4.5,WIND_BEND_CLEARANCE=8,WIND_HEAD_REACH=3;
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const pointBounds=points=>[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
 const polylineLength=points=>points.reduce((sum,p,i)=>sum+(i?distance(points[i-1],p):0),0);
 const windBoundsMeet=(a,b)=>a[0]<b[2]+WIND_BEND_CLEARANCE+WIND_HEAD_REACH&&a[2]>b[0]-WIND_BEND_CLEARANCE-WIND_HEAD_REACH&&a[1]<b[3]+WIND_BEND_CLEARANCE+WIND_HEAD_REACH&&a[3]>b[1]-WIND_BEND_CLEARANCE-WIND_HEAD_REACH;
 function sample(points,count=6){const p=copy(points);if(!Number.isInteger(count)||count<2||count>512||!p.length)throw Error('Sample count must be 2–512 with at least one point.');if(p.length===1)return Array.from({length:count},()=>[...p[0]]);const arcs=[0];for(let i=1;i<p.length;i++)arcs.push(arcs.at(-1)+distance(p[i-1],p[i]));const out=[];let segment=1;for(let i=0;i<count;i++){const at=arcs.at(-1)*i/(count-1);while(segment<p.length-1&&arcs[segment]<at)segment++;const a=p[segment-1],b=p[segment],span=arcs[segment]-arcs[segment-1],t=span?(at-arcs[segment-1])/span:0;out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}out[0]=[...p[0]];out[count-1]=[...p.at(-1)];return out;}
 function smooth(points,iterations=2){let p=copy(points);if(p.length<3)return p;const simplified=[p[0]];for(let i=1;i<p.length-1;i++)if(distance(p[i],simplified.at(-1))>=2)simplified.push(p[i]);simplified.push(p.at(-1));p=simplified.length>128?sample(simplified,128):simplified;for(let n=0;n<Math.min(3,Math.max(0,iterations));n++){const next=[p[0]];for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i];next.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}next.push(p.at(-1));p=next.length>512?sample(next,512):next;}return p;}
 function windCenterline(points){
  let p=copy(points).filter((q,i,all)=>!i||distance(q,all[i-1])>1e-7);if(p.length<2)return null;
  const start=p[0],end=p.at(-1),chord=distance(start,end);
  if(p.length>2&&chord>=24){
   // Treat minor pointer jitter as a straight guide. Keep genuine turns and reversals.
   const ux=(end[0]-start[0])/chord,uy=(end[1]-start[1])/chord,tol=Math.min(5,Math.max(1.25,chord*.012));
   let furthest=0;
   if(p.every(([x,y])=>{
    const dx=x-start[0],dy=y-start[1],along=dx*ux+dy*uy;
    const aligned=Math.abs(dx*uy-dy*ux)<=tol&&along>=furthest-tol&&along<=chord+tol;
    furthest=Math.max(furthest,along);return aligned;
   }))p=[start,end];
  }
  const sampled=p.length>150?sample(p,150):p,stages=chord>180?Math.min(5,Math.ceil(chord/90)):1,pieces=[];
  for(let k=0;k<stages;k++){const lo=Math.floor(k*sampled.length/stages),hi=Math.floor((k+1)*sampled.length/stages),piece=smooth(sampled.slice(lo,k===stages-1?undefined:hi+1),2);pieces.push(...(k?piece.slice(1):piece));}
  const joined=smooth(pieces,1),cumulative=[0];
  for(let i=1;i<joined.length;i++)cumulative.push(cumulative.at(-1)+distance(joined[i-1],joined[i]));
  const length=cumulative.at(-1);if(length<1e-6)return null;
  const pointAt=station=>{station=Math.max(0,Math.min(length,station));let lo=0,hi=joined.length-1;while(hi-lo>1){const k=(lo+hi)>>1;if(cumulative[k]<=station)lo=k;else hi=k;}const span=cumulative[hi]-cumulative[lo],t=span?(station-cumulative[lo])/span:0;return joined[lo].map((v,j)=>v+(joined[hi][j]-v)*t);};
  const tangentAt=(station,radius)=>{const a=pointAt(station-radius),b=pointAt(station+radius),d=distance(a,b);if(d<1e-8){const c=pointAt(station+1),q=pointAt(station);const n=distance(c,q);return n?[(c[0]-q[0])/n,(c[1]-q[1])/n]:[1,0];}return[(b[0]-a[0])/d,(b[1]-a[1])/d];};
  const at=(station,window=24)=>{const tangent=tangentAt(station,Math.max(20,window*1.5)),before=tangentAt(station-window*4,Math.max(8,window*.5)),after=tangentAt(station+window*4,Math.max(8,window*.5)),turn=Math.atan2(before[0]*after[1]-before[1]*after[0],before[0]*after[0]+before[1]*after[1]);const a=tangentAt(station-window,window),b=tangentAt(station+window,window),curvature=Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1])/(2*window);return {point:pointAt(station),tangent,normal:[-tangent[1],tangent[0]],turn,curvature};};
  return {points:joined,cumulative,length,at,start,end};
 }
 function windLaneOffset(frame,offset){
  // On the concave side an unrestricted offset folds back across the bend.
  // Compress that side continuously before the offset curve can reverse.
  const compression=frame.curvature*offset;
  return compression>0?offset/(1+compression*1.65):offset;
 }
 function windPolyline(g,width,curvature){
  const window=clamp(width*.23,20,55),direction=g.direction||1,at=g.line.at(g.station+direction*g.length/2,window);
  if(!at||!Number.isFinite(at.turn))return[];
  const {point,tangent,normal}=at,signedTurn=curvature??at.turn,side=clamp(g.offset/(width/2),-1,1),normalizedTurn=clamp(signedTurn/(Math.PI/2),-1,1);
  const taperSafe=g.variation===undefined?1:g.variation,lateral=windLaneOffset(at,g.offset),center=[point[0]+normal[0]*lateral,point[1]+normal[1]*lateral];
  const sweep=clamp(signedTurn*g.length/(2*window),-.60,.60),length=g.length*taperSafe*(1+.025*side-.24*normalizedTurn*side);
  const steps=Math.max(5,Math.min(24,Math.ceil(length/3.5)));
  return Array.from({length:steps+1},(_,i)=>{
   const angle=(i/steps-.5)*sweep,x=Math.abs(sweep)>1e-6?Math.sin(angle)*length/sweep:(i/steps-.5)*length,y=Math.abs(sweep)>1e-6?2*Math.sin(angle/2)**2*length/sweep:0;
   return [center[0]+tangent[0]*x*direction+normal[0]*y,center[1]+tangent[1]*x*direction+normal[1]*y];
  });
 }
 function windSegmentDistance(p,q,r,s){
  const dx=q[0]-p[0],dy=q[1]-p[1],ux=s[0]-r[0],uy=s[1]-r[1],rx=r[0]-p[0],ry=r[1]-p[1],den=dx*uy-dy*ux;
  if(den){const t=(rx*uy-ry*ux)/den,u=(rx*dy-ry*dx)/den;if(t>=0&&t<=1&&u>=0&&u<=1)return 0;}
  const point=(x,y,a,b)=>{const vx=b[0]-a[0],vy=b[1]-a[1],len=vx*vx+vy*vy,k=len?clamp(((x-a[0])*vx+(y-a[1])*vy)/len,0,1):0;return Math.hypot(x-a[0]-vx*k,y-a[1]-vy*k);};
  return Math.min(point(p[0],p[1],r,s),point(q[0],q[1],r,s),point(r[0],r[1],p,q),point(s[0],s[1],p,q));
 }
 function windJump(a,b,clearance=WIND_CLEARANCE){
  const n=a.points.length-1,m=b.points.length-1;
  for(let i=0;i<n;i++){const p=a.points[i],q=a.points[i+1];
   for(let j=0;j<m;j++){const r=b.points[j],s=b.points[j+1];if(windSegmentDistance(p,q,r,s)<clearance)return true;}
  }return false;
 }
 function clipWindSegment(a,b,viewport,pad){
  if(!viewport)return[0,1];let lo=0,hi=1;const dx=b[0]-a[0],dy=b[1]-a[1];
  for(const [p,q] of [[-dx,a[0]-viewport[0]+pad],[dx,viewport[2]+pad-a[0]],[-dy,a[1]-viewport[1]+pad],[dy,viewport[3]+pad-a[1]]]){if(!p){if(q<0)return null;continue;}const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;}return[lo,hi];
 }
 function windFrame(time,phase=0){
  if(!Number.isFinite(time)||!Number.isFinite(phase))throw Error('Wind time and phase must be finite.');
  // A station hands off to its downstream neighbor exactly as its head
  // reaches the endpoint. The old tail clears while the next head advances.
  const cycle=((time/2400-phase)%1+1)%1,travel=cycle*2,trail=.76,start=clamp(travel-trail,0,1),end=clamp(travel,0,1);
  return {visible:end>start,start,end,head:end,cycle,sweep:.5,hold:false};
 }
 function windVisibility(field,time){
  return field.flatMap(arrow=>{const frame=windFrame(time,arrow.stagger);return frame.visible?[{arrow,frame}]:[];});
 }
 function createWorldWindField(points,width=100,speed=27,options={}){
  if(!Number.isFinite(width)||width<=0||!Number.isFinite(speed)||speed<0)throw Error('Wind dimensions and speed must be finite and positive.');
  const source=copy(points).filter((p,i,all)=>!i||distance(p,all[i-1])>1e-7);if(source.length<1)return null;
  const guideStart=source[0],guideEnd=source.at(-1),guideChord=distance(guideStart,guideEnd),guideUnit=guideChord?[(guideEnd[0]-guideStart[0])/guideChord,(guideEnd[1]-guideStart[1])/guideChord]:[1,0],brushTolerance=guideChord*.012;
  const directionPoints=source.length>2&&source.length<=96&&guideChord>2*brushTolerance&&source.every(p=>Math.abs((p[0]-guideStart[0])*guideUnit[1]-(p[1]-guideStart[1])*guideUnit[0])<=brushTolerance&&(p[0]-guideStart[0])*guideUnit[0]+(p[1]-guideStart[1])*guideUnit[1]>=-brushTolerance&&(p[0]-guideStart[0])*guideUnit[0]+(p[1]-guideStart[1])*guideUnit[1]<=guideChord+brushTolerance)?[guideStart,guideEnd]:source;
  const segments=[];let unwrapped=null,pathLength=0;
  for(let i=1;i<directionPoints.length;i++){
   const a=directionPoints[i-1],b=directionPoints[i],length=distance(a,b);if(length<=1e-8)continue;
   const raw=Math.atan2(b[1]-a[1],b[0]-a[0]);
   unwrapped=unwrapped===null?raw:unwrapped+Math.atan2(Math.sin(raw-unwrapped),Math.cos(raw-unwrapped));
   segments.push({a,b,length,angle:unwrapped,start:pathLength});pathLength+=length;
  }
  if(!segments.length)return null;
  const total=pathLength,sigma=Math.max(total*.045,1e-6);
  const nearest=(x,y)=>{let best=Infinity,along=0,segment=-1;for(let i=0;i<segments.length;i++){const s=segments[i],dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],t=clamp(((x-s.a[0])*dx+(y-s.a[1])*dy)/(s.length*s.length),0,1),d=Math.hypot(x-s.a[0]-dx*t,y-s.a[1]-dy*t);if(d<best){best=d;along=t*s.length;segment=i;}}return {distance:best,along,segment};};
  const globalAngle=(x,y,probe)=>{let sum=0,weight=0;for(const s of segments){const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],t=clamp(((x-s.a[0])*dx+(y-s.a[1])*dy)/(s.length*s.length),0,1),d=Math.hypot(x-s.a[0]-dx*t,y-s.a[1]-dy*t),w=s.length*Math.exp(-(d-probe.distance)/sigma);sum+=w*s.angle;weight+=w;}return weight?sum/weight:segments[probe.segment].angle;};
  // RDP only stabilizes the opposite-turn detection. The retained brush
  // coordinates still define the local diagonal and its geographic support.
  const rdp=(list,tolerance=Math.max(total*.008,1e-9))=>{
   if(list.length<=2)return [list[0],list.at(-1)];
   const keep=new Set([0,list.length-1]),stack=[[0,list.length-1]];
   while(stack.length){
    const [first,last]=stack.pop(),a=list[first],b=list[last],dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;
    let farthest=-1,distanceToChord=0;
    for(let i=first+1;i<last;i++){const t=len?clamp(((list[i][0]-a[0])*dx+(list[i][1]-a[1])*dy)/len,0,1):0,d=Math.hypot(list[i][0]-a[0]-dx*t,list[i][1]-a[1]-dy*t);if(d>distanceToChord){distanceToChord=d;farthest=i;}}
    if(distanceToChord>tolerance){keep.add(farthest);stack.push([first,farthest],[farthest,last]);}
   }
   return [...keep].sort((a,b)=>a-b).map(i=>list[i]);
  };
  const turns=points=>{
   const out=[];
   for(let i=1;i+1<points.length;i++){const a=points[i-1],b=points[i],c=points[i+1],u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-b[0],c[1]-b[1]];out.push(Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]));}
   return out;
  };
  const simplified=rdp(source),rawTurns=turns(simplified),zBends=[],normalizeAngle=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
  for(let first=0;first+1<rawTurns.length;first++){
   if(!(rawTurns[first]*rawTurns[first+1]<0)||Math.abs(rawTurns[first])<.08||Math.abs(rawTurns[first+1])<.08)continue;
   for(let last=first+1;last<rawTurns.length;last++){if(rawTurns[first]*rawTurns[last]>=0)continue;const middle=simplified.slice(first+1,last+2),a=middle[0],b=middle.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<sigma*.5)break;const tail=simplified[last+2]??b,follow=tail,direction=Math.atan2(dy,dx),entry=Math.atan2(simplified[first+1][1]-simplified[first][1],simplified[first+1][0]-simplified[first][0]),exit=Math.atan2(follow[1]-b[1],follow[0]-b[0]);zBends.push({start:simplified[first+1],end:b,angle:direction,length,halfWidth:length*.5,entry:normalizeAngle(entry-direction),exit:normalizeAngle(exit-direction)});break;}
  }
  const direction=(x,y,probe)=>{
   const baseline=globalAngle(x,y,probe);
   let angle=baseline;
   for(const fold of zBends){
    const dx=fold.end[0]-fold.start[0],dy=fold.end[1]-fold.start[1],base=[x-fold.start[0],y-fold.start[1]],along=(base[0]*dx+base[1]*dy)/fold.length,lateral=(base[0]*dy-base[1]*dx)/fold.length;
    const ramp=fold.length*.31;
    let desired=along<0?fold.entry:along>fold.length?fold.exit:0;
    if(along>=0&&along<=ramp)desired=fold.entry*(1-clamp(along/ramp,0,1));
    else if(along>=fold.length-ramp&&along<=fold.length)desired=fold.exit*clamp((along-fold.length+ramp)/ramp,0,1);
    const axialOutside=Math.max(0,-along,along-fold.length),lateralWeight=Math.exp(-Math.pow(lateral/(fold.halfWidth*.72),2)),axialWeight=clamp(1-axialOutside/(fold.length*.18),0,1),blend=lateralWeight*Math.pow(axialWeight,2)*(3-2*axialWeight);
    if(blend>1e-8){const target=fold.angle+desired,delta=Math.atan2(Math.sin(baseline-target),Math.cos(baseline-target));angle=target+delta*(1-blend);}
   }
   return {heading:[Math.cos(angle),Math.sin(angle)]};
  };
  function sampleWind(x,y,halfWidth=width/2){
   if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(halfWidth)||halfWidth<=0)throw Error('Wind samples need finite coordinates and a positive half-width.');
   const probe=nearest(x,y);if(probe.distance>halfWidth)return null;const flow=direction(x,y,probe);
   return {point:[x,y],heading:flow.heading,along:probe.along,distance:halfWidth-probe.distance,halfWidth,outerness:probe.distance/halfWidth};
  }
  let maxTurn=0;
  for(let i=1;i<segments.length;i++)maxTurn=Math.max(maxTurn,Math.abs(segments[i].angle-segments[i-1].angle));
  return Object.freeze({kind:'signed-world-wind',points:source.map(p=>p.slice()),baseHalfWidth:width/2,speed,sigma,total,sample:sampleWind,hasPoint:(x,y,halfWidth=width/2)=>nearest(x,y).distance<=halfWidth,maxTurn});
 }
 function windField(points,width=100,spacing=undefined,speed=27,viewport,options={},mapZoom){
  if(!Number.isFinite(width)||width<=0||(spacing!=null&&!(Number.isFinite(spacing)&&spacing>0))||!Number.isFinite(speed)||speed<0)throw Error('Wind dimensions and speed must be finite and positive.');
  const line=windCenterline(points);if(!speed||!line)return[];
  const scale=1;
  const lateral=(spacing||24)*scale,fullMax=Math.floor(width/(2*lateral)),laneCap=30,glyphLength=Math.max(7,speed*scale),period=Math.max(19,glyphLength*1.35),window=clamp(width*.23,20,55);
  const viewCenter=viewport&&[(viewport[0]+viewport[2])/2,(viewport[1]+viewport[3])/2];
  const probes=viewport?[viewCenter,[viewport[0],viewCenter[1]],[viewport[2],viewCenter[1]],[viewCenter[0],viewport[1]],[viewCenter[0],viewport[3]]]:[];
  const laneCenters=[];
  if(fullMax>laneCap)for(const [x,y] of probes){
   let nearest=Infinity,signed=0;
   for(let i=1;i<line.points.length;i++){
    const a=line.points[i-1],b=line.points[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(len<1e-6)continue;
    const t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(len*len),0,1),px=x-a[0]-t*dx,py=y-a[1]-t*dy,d=Math.hypot(px,py);
    if(d<nearest){nearest=d;signed=(py*dx-px*dy)/len;}
   }
   laneCenters.push(clamp(Math.round(signed/lateral),-fullMax,fullMax));
  }
  const lanes=fullMax<=laneCap||!viewport
   ?Array.from({length:2*Math.min(fullMax,laneCap)+1},(_,i)=>i===0?0:(i%2?1:-1)*Math.ceil(i/2))
   :[...new Set([...laneCenters,0].flatMap(c=>Array.from({length:35},(_,i)=>clamp(c+(i%2?1:-1)*Math.ceil(i/2),-fullMax,fullMax))))].slice(0,115);
  const out=[],bins=new Map(),binSize=52;
  const keys=(box,pad=0)=>{const out=[];for(let y=Math.floor((box[1]-pad)/binSize);y<=Math.floor((box[3]+pad)/binSize);y++)for(let x=Math.floor((box[0]-pad)/binSize);x<=Math.floor((box[2]+pad)/binSize);x++)out.push(x+','+y);return out;};
  const conflict=arrow=>{
   const candidates=new Set(keys(arrow.bounds,26).flatMap(key=>bins.get(key)||[]));
   for(const other of candidates){
    const threshold=Math.max(arrow.clearance,other.clearance),a=arrow.vector,b=other.vector;
    // A tight fold can bring opposite branches next to each other even when
    // their shafts miss. Keep one local flow direction in that shared strip.
    if((a[0]*b[0]+a[1]*b[1])<.34*Math.hypot(...a)*Math.hypot(...b)&&distance(arrow.midpoint,other.midpoint)<24)return true;
    if(windBoundsMeet(arrow.bounds,other.bounds)&&windJump(arrow,other,threshold))return true;
   }
   return false;
  };
  // Clip the actual lateral lane before spending placement budget: a huge
  // wind band must not exhaust all its stations left of the viewport.
  const anchors=[...new Set(line.cumulative.flatMap(n=>[n,clamp(n-window*2,0,line.length),clamp(n+window*2,0,line.length)]))].sort((a,b)=>a-b);
  const frames=anchors.map(s=>line.at(s,window));
  const laneRanges=offset=>{
   if(!viewport)return [[0,line.length]];
   const shifted=frames.map(f=>{const o=windLaneOffset(f,offset);return [f.point[0]+f.normal[0]*o,f.point[1]+f.normal[1]*o];});
   const ranges=[];
   for(let i=1;i<shifted.length;i++){
    const hit=clipWindSegment(shifted[i-1],shifted[i],viewport,period*1.5+20);if(!hit)continue;
    const a=anchors[i-1],d=anchors[i]-a,lo=a+hit[0]*d,hi=a+hit[1]*d,last=ranges.at(-1);
    if(last&&lo<=last[1]+1)last[1]=hi;else ranges.push([lo,hi]);
   }
   return ranges;
  };
  const make=(lane,index,station,offset,shorten,nudge)=>{
   station=clamp(station+nudge,0,line.length);
   const desired=Math.min(glyphLength*shorten,line.length-station);if(desired<4)return null;
   const variation=lane===0?1:(.91+.08*Math.sin(index*.83+lane*1.31))*(1-.10*Math.abs(offset)/(width/2));
   const frame=line.at(station+desired/2,window),curve=windPolyline({line,station,length:desired,offset,variation},width,frame.turn);
   const arc=polylineLength(curve);if(arc<3)return null;
   const bounds=pointBounds(curve),from=curve[0],to=curve.at(-1),vector=[to[0]-from[0],to[1]-from[1]];
   const stagger=((index*.5+lane*.127+1)%1+1)%1;
   return {id:'w-'+lane+'-'+index,from,to,points:curve,vector,midpoint:curve[Math.floor(curve.length/2)],phase:stagger,stagger,period,pitch:.5,physical:true,virtual:false,index,contributors:1,lane:lane*lateral,pathLane:lane*lateral,laneOffset:offset,station,major:lane===0,arcLength:arc,glyphLength:arc,spanLength:period,visualLength:desired,speedFactor:arc/period,strength:arc/speed,pathLength:line.length,laneGap:WIND_GAP,direction:1,bounds,clearance:Math.abs(frame.turn)>.09?8:6};
  };
  for(const lane of lanes){
   const offset=lane*lateral,shift=lane===0?0:period*(.22*Math.sin(lane*1.71)),visited=new Set();
   for(const [low,high] of laneRanges(offset)){
    const start=Math.max(0,Math.floor((low-shift)/period));
    for(let index=start;index*period+shift<=high&&out.length<WIND_LIMIT;index++){
     if(visited.has(index))continue;visited.add(index);
     const station=index*period+shift;
     for(const [shorten,nudge,lateralNudge] of [[1,0,0],[.83,0,0],[.68,period*.13,2],[.60,-period*.12,-2]]){
      const arrow=make(lane,index,station,clamp(offset+lateralNudge,-width/2,width/2),shorten,nudge);if(!arrow)continue;
      const box=arrow.bounds;
      if(viewport&&(box[2]<viewport[0]-18||box[0]>viewport[2]+18||box[3]<viewport[1]-18||box[1]>viewport[3]+18))continue;
      if(conflict(arrow))continue;
      if(shorten<1)arrow.retry={station:nudge,lateral:lateralNudge,lengthScale:shorten};
      out.push(arrow);
      for(const key of keys(box)){if(!bins.has(key))bins.set(key,[]);bins.get(key).push(arrow);}
      break;
     }
    }
    if(out.length>=WIND_LIMIT)break;
   }
  }
  const byLane=new Map();
  for(const arrow of out){if(!byLane.has(arrow.lane))byLane.set(arrow.lane,[]);byLane.get(arrow.lane).push(arrow);}
  for(const arrows of byLane.values()){
   arrows.sort((a,b)=>a.station-b.station);
   const start=arrows[0].stagger;
   arrows.forEach((arrow,i)=>{arrow.phase=arrow.stagger=(start+i%2*.5)%1;});
  }
  return out;
 }
 function shadeIntensity(e){
  let amount=e.type==='heavy_rain'?Math.max(0,e.rainIn):e.type==='thunderstorm'?Math.max(0,e.coverage):Math.max(0,e.treatedFraction)*Math.pow(.5,Math.max(0,e.ageYears)/8);
  const reference=e.type==='heavy_rain'?.4:e.type==='thunderstorm'?.2:.25;
  return amount/(amount+reference);
 }
 function stormGrid(area,project,unproject,inside){
  const b=area.bounds,nw=project([b[0],b[3]]),se=project([b[2],b[1]]),left=Math.min(nw[0],se[0]),top=Math.min(nw[1],se[1]),w=Math.abs(se[0]-nw[0]),h=Math.abs(se[1]-nw[1]);
  if(w<8||h<8)return {lightning:[],rain:[]};
  const spacing=Math.max(Math.max(w,h)/14,Math.min(80,Math.max(10,Math.min(w,h)/2.5))),columns=Math.max(2,Math.ceil(w/spacing)),rows=Math.max(2,Math.ceil(h/spacing)),lightning=[],rain=[],visible=new Map();
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const point=[left+(x+.5)*spacing,top+(y+.5)*spacing],position=unproject(point);
    if(inside(position)){const cell={x,y,position,point};visible.set(x+','+y,cell);lightning.push(cell);}
  }
  for(let y=0;y<rows-1;y++)for(let x=0;x<columns-1;x++){
    const corners=[[x,y],[x+1,y],[x,y+1],[x+1,y+1]].map(p=>visible.get(p.join(','))).filter(Boolean),position=unproject([left+(x+1)*spacing,top+(y+1)*spacing]);
    if(corners.length>=3&&inside(position))rain.push({position,cornerCount:corners.length});
  }
  return {lightning,rain};
 }
 function raster(mask,w,h){if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||mask.length!==w*h)throw Error('Mask dimensions do not match.');}
 function distanceField(mask,w,h,bounded=true){raster(mask,w,h);const edge=bounded?1:1e6,d=Float32Array.from(mask,v=>v?1e6:0),diag=Math.SQRT2;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!mask[i])continue;d[i]=Math.min(d[i],x?d[i-1]+1:edge,y?d[i-w]+1:edge,x&&y?d[i-w-1]+diag:1e6,x<w-1&&y?d[i-w+1]+diag:1e6);}for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(!mask[i])continue;d[i]=Math.min(d[i],x<w-1?d[i+1]+1:edge,y<h-1?d[i+w]+1:edge,x<w-1&&y<h-1?d[i+w+1]+diag:1e6,x&&y<h-1?d[i+w-1]+diag:1e6);}return d;}
 function expandMask(mask,w,h,radius){raster(mask,w,h);if(!Number.isFinite(radius))throw Error('Radius must be finite.');const out=new Uint8Array(mask);if(!radius)return out;const r=Math.min(Math.max(w,h),Math.abs(radius)),offsets=[];for(let dy=-Math.ceil(r);dy<=Math.ceil(r);dy++)for(let dx=-Math.ceil(r);dx<=Math.ceil(r);dx++)if(dx*dx+dy*dy<=r*r)offsets.push([dx,dy]);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const vals=offsets.map(([dx,dy])=>x+dx>=0&&y+dy>=0&&x+dx<w&&y+dy<h&&!!mask[(y+dy)*w+x+dx]);out[y*w+x]=radius>0?Number(vals.some(Boolean)):Number(vals.every(Boolean));}return out;}
 const coasts={west:[[-117.15,32.5],[-118.5,34],[-120.6,34.5],[-122.4,37.8],[-124.3,40],[-124.5,42],[-124.1,44],[-124.2,46],[-124.7,48]],east:[[-80.2,25.5],[-80.8,28],[-81.1,30.5],[-79.8,32],[-77.8,34],[-75.5,35.5],[-75.8,37.2],[-73.9,40.6],[-70.7,41.6],[-70.1,43],[-67.1,45]]};
 function coastalTrack(center,zoom){const c=copy([center])[0];if(!Number.isFinite(zoom)||zoom<0)throw Error('Zoom must be non-negative.');let best;
  for(const [side,coast] of Object.entries(coasts)){const factor=Math.cos(c[1]*Math.PI/180);let arc=0;for(let i=1;i<coast.length;i++){const a=coast[i-1],b=coast[i],dx=(b[0]-a[0])*factor,dy=b[1]-a[1],t=Math.max(0,Math.min(1,((c[0]-a[0])*factor*dx+(c[1]-a[1])*dy)/(dx*dx+dy*dy))),q=[a[0]+(b[0]-a[0])*t,a[1]+dy*t],dist=Math.hypot((q[0]-c[0])*factor,q[1]-c[1]);if(!best||dist<best.dist)best={side,index:i,t,dist,coast};arc+=distance(a,b);}}
  const offshore=best.coast.map(p=>[p[0]+(best.side==='west'?-.65:1.0),p[1]]),arcs=[0];for(let i=1;i<offshore.length;i++)arcs.push(arcs.at(-1)+distance(offshore[i-1],offshore[i]));const start=arcs[best.index-1]+(arcs[best.index]-arcs[best.index-1])*best.t,step=Math.min(1.2,80/2**zoom),direction=arcs.at(-1)-start<step*5?-1:1;
  const at=target=>{target=Math.max(0,Math.min(arcs.at(-1),target));let i=1;while(i<arcs.length-1&&arcs[i]<target)i++;const a=offshore[i-1],b=offshore[i],t=(target-arcs[i-1])/(arcs[i]-arcs[i-1]);return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];};
  return Array.from({length:6},(_,i)=>[...at(start+direction*step*i),80-i*3]);
 }
 const api={smooth,sample,windField,createWorldWindField,windFrame,windVisibility,traceWindCenterline:windCenterline,traceWindPolyline:windPolyline,shadeIntensity,stormGrid,distanceField,expandMask,coastalTrack,defaultTrack:map=>{const c=map.getCenter();return coastalTrack([c.lng,c.lat],map.getZoom());}};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.FireDrawing=api;
})(typeof window==='undefined'?globalThis:window);

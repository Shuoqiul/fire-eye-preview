'use strict';
/* Pure drawing geometry shared by the browser editor and Node checks. */
(function(root){
 const copy=points=>{if(!Array.isArray(points)||points.some(p=>!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])))throw Error('Provide finite coordinate pairs.');return points.map(p=>p.slice(0,2));};
 const distance=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
 function sample(points,count=6){const p=copy(points);if(!Number.isInteger(count)||count<2||count>512||!p.length)throw Error('Sample count must be 2–512 with at least one point.');if(p.length===1)return Array.from({length:count},()=>[...p[0]]);const arcs=[0];for(let i=1;i<p.length;i++)arcs.push(arcs.at(-1)+distance(p[i-1],p[i]));const out=[];let segment=1;for(let i=0;i<count;i++){const at=arcs.at(-1)*i/(count-1);while(segment<p.length-1&&arcs[segment]<at)segment++;const a=p[segment-1],b=p[segment],span=arcs[segment]-arcs[segment-1],t=span?(at-arcs[segment-1])/span:0;out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}out[0]=[...p[0]];out[count-1]=[...p.at(-1)];return out;}
 function smooth(points,iterations=2){let p=copy(points);if(p.length<3)return p;const simplified=[p[0]];for(let i=1;i<p.length-1;i++)if(distance(p[i],simplified.at(-1))>=2)simplified.push(p[i]);simplified.push(p.at(-1));p=simplified.length>128?sample(simplified,128):simplified;for(let n=0;n<Math.min(3,Math.max(0,iterations));n++){const next=[p[0]];for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i];next.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}next.push(p.at(-1));p=next.length>512?sample(next,512):next;}return p;}
 function windField(points,width=100,spacing=undefined,speed=27,viewport){
  const p=copy(points);if(p.length<2)return[];
  if(!Number.isFinite(width)||width<=0||(spacing!=null&&!(Number.isFinite(spacing)&&spacing>0))||!Number.isFinite(speed)||speed<0)throw Error('Wind field dimensions and speed must be finite and positive.');
  if(!speed)return[];
  const segments=[];let pathLength=0;
  for(let i=1;i<p.length;i++){
   const a=p[i-1],b=p[i],span=distance(a,b);if(!span)continue;
   const tangent=[(b[0]-a[0])/span,(b[1]-a[1])/span],arc=pathLength;segments.push({a,b,span,tangent,normal:[-tangent[1],tangent[0]],start:arc,index:i-1});pathLength+=span;
  }
  if(!pathLength)return[];
  const taper=offset=>Math.max(.15,1-.72*Math.pow(Math.abs(offset)/(width/2),1.5)),localSpeed=offset=>speed*taper(offset),lateral=spacing||24,laneCount=Math.max(1,Math.ceil((width-1e-7)/2/lateral)),laneIndexes=Array.from({length:laneCount*2+1},(_,i)=>i-laneCount),out=[],seen=new Set();
  let candidates=0,hasMerged=false;
  // Bound candidate work before rendering; viewport clipping retains visible density after zoom.
  for(let laneIndex=0;laneIndex<laneIndexes.length;laneIndex++){
   const lane=laneIndexes[laneIndex]*lateral,pitch=lateral,stagger=((lane/lateral)%4+4)%4*.071,baseLength=localSpeed(lane);
   const lead=(speed+5)/2;let at=lead;
   for(const source of segments){
    const offset=source.normal.map(n=>n*lane),a=source.a.map((v,i)=>v+offset[i]),b=source.b.map((v,i)=>v+offset[i]),range=clipWindSegment(a,b,viewport,Math.min(600,speed*2+8));if(!range)continue;
    const lo=source.start+range[0]*source.span,hi=source.start+range[1]*source.span;
    if(at<lo)at=lead+Math.ceil((lo-lead)/(speed+5))*(speed+5);
    const cut=lo>0?lo:0,atStep=Math.floor(cut/pitch)+.5+stagger;
    if(at<cut)at=pitch*atStep;
    while(at<hi-1e-7){
     if(++candidates>2400)return out;
     const along=at-source.start,center=[a[0]+source.tangent[0]*along,a[1]+source.tangent[1]*along],vector=[0,0],found=[];
     for(const segment of segments){
      const dx=center[0]-segment.a[0],dy=center[1]-segment.a[1],u=dx*segment.tangent[0]+dy*segment.tangent[1],across=dx*segment.normal[0]+dy*segment.normal[1];
      if(u< -1e-7||u>segment.span+1e-7||Math.abs(across)>width/2+1e-7)continue;
      const strength=taper(across),member={tangent:segment.tangent,strength,speed:speed,speedAt:localSpeed(across),segment:segment.index,across};
      if(!found.some(other=>other.segment===member.segment)){found.push(member);vector[0]+=segment.tangent[0]*strength;vector[1]+=segment.tangent[1]*strength;}
     }
     const members=found.length?found:[{tangent:source.tangent,strength:1,speed:speed,speedAt:speed,segment:source.index,across:lane}];
     const summedStrength=Math.hypot(...vector),direction=summedStrength?vector.map(value=>value/summedStrength):[0,0],localStrength=Math.min(1,Math.max(...members.map(member=>member.strength)))*speed,primary=members[0],phase=((Math.round(at/pitch)*.5001+laneIndex*.137)%1+1)%1,key=Math.round(center[0]/2)+','+Math.round(center[1]/2);
     if(localStrength>1e-6&&summedStrength>1e-9&&at+localStrength/2<=pathLength+1e-7&&!seen.has(key)){
      const arrow={id:key,from:center.map((v,i)=>v-direction[i]*localStrength/2),to:center.map((v,i)=>v+direction[i]*localStrength/2),vector:direction.map(value=>value*localStrength),strength:localStrength/speed,phase,contributors:members.length,members,lane:primary.across,pathLane:lane,station:at,localStation:primary.segment===source.index?along:0,fromStation:at,segment:primary.segment,laneSpacing:localStrength+5,laneGap:5,pathLength};
      if(!(members.length>1||hasMerged)||!out.some(other=>windConflict(arrow,other,lateral))){seen.add(key);out.push(arrow);hasMerged||=members.length>1;}
      if(out.length>=1200)return out;
     }
     const next=Math.max(baseLength,localStrength)+5;
     at+=next;
    }
   }
  }
  return out;
 }
 function windConflict(a,b,lateral){
  if(a.contributors<2&&b.contributors<2)return false;
  const al=Math.hypot(...a.vector),bl=Math.hypot(...b.vector),dx=(a.from[0]+a.to[0]-b.from[0]-b.to[0])/2,dy=(a.from[1]+a.to[1]-b.from[1]-b.to[1])/2;
  if(Math.hypot(dx,dy)>(al+bl)/2+5)return false;
  const dot=(a.vector[0]*b.vector[0]+a.vector[1]*b.vector[1])/(al*bl);
  if(dot>.8&&Math.abs((dx*a.vector[0]+dy*a.vector[1])/al)<(al+bl)/2+5&&Math.abs((dx*a.vector[1]-dy*a.vector[0])/al)<lateral*.5)return true;
  const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  return cross(a.from,a.to,b.from)*cross(a.from,a.to,b.to)<-1e-6&&cross(b.from,b.to,a.from)*cross(b.from,b.to,a.to)<-1e-6;
 }
 function clipWindSegment(a,b,viewport,padding){
  if(!viewport)return[0,1];
  let lo=0,hi=1;const dx=b[0]-a[0],dy=b[1]-a[1];
  for(const [p,q] of [[-dx,a[0]-viewport[0]+padding],[dx,viewport[2]+padding-a[0]],[-dy,a[1]-viewport[1]+padding],[dy,viewport[3]+padding-a[1]]]){
   if(!p){if(q<0)return null;continue;}
   const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;
  }
  return[lo,hi];
 }
 function windFrame(time,phase=0){
  const cycle=(((time/2400-phase)%1)+1)%1,head=cycle*4,tail=head-1,start=Math.max(0,tail),end=Math.min(1,head);
  return {visible:end>start,start,end,head:head>0&&head<=1,cycle};
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
 function expandMask(mask,w,h,radius){raster(mask,w,h);if(!Number.isFinite(radius))throw Error('Radius must be finite.');const out=new Uint8Array(mask);if(!radius)return out;const r=Math.min(Math.max(w,h),Math.abs(radius)),offsets=[];for(let dy=-Math.ceil(r);dy<=Math.ceil(r);dy++)for(let dx=-Math.ceil(r);dx<=Math.ceil(r);dx++)if(dx*dx+dy*dy<=r*r)offsets.push([dx,dy]);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const values=offsets.map(([dx,dy])=>x+dx>=0&&y+dy>=0&&x+dx<w&&y+dy<h&&!!mask[(y+dy)*w+x+dx]);out[y*w+x]=radius>0?Number(values.some(Boolean)):Number(values.every(Boolean));}return out;}
 const coasts={west:[[-117.15,32.5],[-118.5,34],[-120.6,34.5],[-122.4,37.8],[-124.3,40],[-124.5,42],[-124.1,44],[-124.2,46],[-124.7,48]],east:[[-80.2,25.5],[-80.8,28],[-81.1,30.5],[-79.8,32],[-77.8,34],[-75.5,35.5],[-75.8,37.2],[-73.9,40.6],[-70.7,41.6],[-70.1,43],[-67.1,45]]};
 function coastalTrack(center,zoom){const c=copy([center])[0];if(!Number.isFinite(zoom)||zoom<0)throw Error('Zoom must be non-negative.');let best;
  for(const [side,coast] of Object.entries(coasts)){const factor=Math.cos(c[1]*Math.PI/180);let arc=0;for(let i=1;i<coast.length;i++){const a=coast[i-1],b=coast[i],dx=(b[0]-a[0])*factor,dy=b[1]-a[1],t=Math.max(0,Math.min(1,((c[0]-a[0])*factor*dx+(c[1]-a[1])*dy)/(dx*dx+dy*dy))),q=[a[0]+(b[0]-a[0])*t,a[1]+dy*t],dist=Math.hypot((q[0]-c[0])*factor,q[1]-c[1]);if(!best||dist<best.dist)best={side,index:i,t,dist,coast};arc+=distance(a,b);}}
  const offshore=best.coast.map(p=>[p[0]+(best.side==='west'?-.65:1.0),p[1]]),arcs=[0];for(let i=1;i<offshore.length;i++)arcs.push(arcs.at(-1)+distance(offshore[i-1],offshore[i]));const start=arcs[best.index-1]+(arcs[best.index]-arcs[best.index-1])*best.t,step=Math.min(1.2,80/2**zoom),direction=arcs.at(-1)-start<step*5?-1:1;
  const at=target=>{target=Math.max(0,Math.min(arcs.at(-1),target));let i=1;while(i<arcs.length-1&&arcs[i]<target)i++;const a=offshore[i-1],b=offshore[i],t=(target-arcs[i-1])/(arcs[i]-arcs[i-1]);return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];};
  return Array.from({length:6},(_,i)=>[...at(start+direction*step*i),80-i*3]);
 }
 const api={smooth,sample,windField,windFrame,shadeIntensity,stormGrid,distanceField,expandMask,coastalTrack,defaultTrack:map=>{const c=map.getCenter();return coastalTrack([c.lng,c.lat],map.getZoom());}};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.FireDrawing=api;
})(typeof window==='undefined'?globalThis:window);

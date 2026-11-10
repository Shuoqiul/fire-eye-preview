'use strict';
/* Pure drawing geometry shared by the browser editor and Node checks. */
(function(root){
 const copy=points=>{if(!Array.isArray(points)||points.some(p=>!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])))throw Error('Provide finite coordinate pairs.');return points.map(p=>p.slice(0,2));};
 const distance=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
 function sample(points,count=6){const p=copy(points);if(!Number.isInteger(count)||count<2||count>512||!p.length)throw Error('Sample count must be 2–512 with at least one point.');if(p.length===1)return Array.from({length:count},()=>[...p[0]]);const arcs=[0];for(let i=1;i<p.length;i++)arcs.push(arcs.at(-1)+distance(p[i-1],p[i]));const out=[];let segment=1;for(let i=0;i<count;i++){const at=arcs.at(-1)*i/(count-1);while(segment<p.length-1&&arcs[segment]<at)segment++;const a=p[segment-1],b=p[segment],span=arcs[segment]-arcs[segment-1],t=span?(at-arcs[segment-1])/span:0;out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}out[0]=[...p[0]];out[count-1]=[...p.at(-1)];return out;}
 function smooth(points,iterations=2){let p=copy(points);if(p.length<3)return p;const simplified=[p[0]];for(let i=1;i<p.length-1;i++)if(distance(p[i],simplified.at(-1))>=2)simplified.push(p[i]);simplified.push(p.at(-1));p=simplified.length>128?sample(simplified,128):simplified;for(let n=0;n<Math.min(3,Math.max(0,iterations));n++){const next=[p[0]];for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i];next.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}next.push(p.at(-1));p=next.length>512?sample(next,512):next;}return p;}
 function windField(points,width=100,spacing=30,speed=27){
  const p=copy(points);if(p.length<2)return[];
  if(!Number.isFinite(width)||width<=0||!Number.isFinite(spacing)||spacing<=0||!Number.isFinite(speed)||speed<0)throw Error('Wind field dimensions and speed must be finite and positive.');
  const length=p.slice(1).reduce((sum,b,i)=>sum+distance(p[i],b),0);if(!length||!speed)return[];
  const centres=sample(p,Math.max(2,Math.min(90,Math.ceil(length/spacing)+1))),lanes=Math.max(1,Math.min(11,Math.ceil(width/spacing))),cells=new Map();
  for(let i=0;i<centres.length;i++){
    const a=centres[Math.max(0,i-1)],b=centres[Math.min(centres.length-1,i+1)],d=distance(a,b)||1,t=[(b[0]-a[0])/d,(b[1]-a[1])/d],normal=[-t[1],t[0]];
    for(let lane=-Math.floor(lanes/2);lane<=Math.floor(lanes/2);lane++){
      const offset=lane*spacing,strength=Math.max(.15,1-Math.abs(offset)/(width*.65)),c=[centres[i][0]+normal[0]*offset,centres[i][1]+normal[1]*offset],gx=Math.round(c[0]/spacing),gy=Math.round(c[1]/spacing),id=gx+','+gy;
      const cell=cells.get(id)||{id,center:[gx*spacing,gy*spacing],vx:0,vy:0,contributors:0,phase:((i*.5+lane*.137)%1+1)%1};
      cell.vx+=t[0]*strength;cell.vy+=t[1]*strength;cell.contributors++;cells.set(id,cell);
    }
  }
  return [...cells.values()].filter(c=>Math.hypot(c.vx,c.vy)>.001).slice(0,300).map(c=>{
    const dx=c.vx*speed*.8,dy=c.vy*speed*.8;
    return {id:c.id,from:[c.center[0]-dx/2,c.center[1]-dy/2],to:[c.center[0]+dx/2,c.center[1]+dy/2],strength:Math.hypot(c.vx,c.vy),phase:c.phase,contributors:c.contributors,vector:[c.vx*speed,c.vy*speed]};
  });
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

'use strict';
/* Shared public recipes and illustrative coastline-aware track envelopes. */
(function(root){
 const KT_TO_MPS=.514444,MPS_TO_MPH=2.2369362921;
 const groups={
  high_wind:[['Breezy',{windMph:20}],['Windy',{windMph:27}],['Strong',{windMph:45}],['Damaging',{windMph:58}]],
  heavy_rain:[.2,.4,.6,.8,1].map(rainIn=>[rainIn.toFixed(1)+' in',{rainIn}]),
  thunderstorm:[['Isolated',.2],['Scattered',.4],['Widespread',.7]].flatMap(([label,coverage])=>[
   [label+', dry',{coverage,dry:true,rainIn:0}],[label+', wet',{coverage,dry:false,rainIn:.4}]
  ]),
  hurricane:[['Tropical storm',17.2,3],['Severe tropical storm',24.5,4],['Hurricane',32.7,6],['Severe typhoon',41.5,8],['Super typhoon',51,10]].map(([label,mps,rainIn])=>[label,{vmax:mps/KT_TO_MPS,windMph:Math.round(mps*MPS_TO_MPH*10)/10,rainIn,coverage:.3}]),
  prescribed_burn:[['Recent treatment',{treatedFraction:.6,ageYears:2}],['Older treatment',{treatedFraction:.6,ageYears:8}],['Light treatment',{treatedFraction:.2,ageYears:2}]]
 };
 Object.values(groups).forEach(list=>{list.forEach(item=>{Object.freeze(item[1]);Object.freeze(item);});Object.freeze(list);});Object.freeze(groups);
 const defaultIndex={high_wind:1,heavy_rain:2,thunderstorm:2,hurricane:2,prescribed_burn:0};
 function inside(ring,p){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
 function coastIndex(geojson){
  const polygons=[];
  for(const feature of geojson.features||[]){const g=feature.geometry;if(g?.type==='Polygon')polygons.push(g.coordinates);else if(g?.type==='MultiPolygon')polygons.push(...g.coordinates);}
  const segments=polygons.flatMap(poly=>poly.flatMap(ring=>ring.slice(1).map((b,i)=>[ring[i],b])));
  return point=>{
   const land=polygons.some(poly=>inside(poly[0],point)&&!poly.slice(1).some(hole=>inside(hole,point))),kx=111.32*Math.max(.01,Math.cos(point[1]*Math.PI/180)),ky=110.57;
   let distanceKm=Infinity;
   for(const [a,b] of segments){
    const ax=(a[0]-point[0])*kx,ay=(a[1]-point[1])*ky,dx=(b[0]-a[0])*kx,dy=(b[1]-a[1])*ky,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
    distanceKm=Math.min(distanceKm,Math.hypot(ax+t*dx,ay+t*dy));
   }
   return {land,distanceKm};
  };
 }
 function weakenTrack(track,vmax,classify=()=>({land:false,distanceKm:Infinity})){
  let wind=vmax;return track.map((point,i)=>{
   if(i){const a=track[i-1];for(let hour=0;hour<12;hour++){
    const t=(hour+.5)/12,position=[a[0]+(point[0]-a[0])*t,a[1]+(point[1]-a[1])*t],coast=classify(position),rate=coast.land ? .09 : .002+.016*Math.exp(-Math.max(0,coast.distanceKm)/60);
    wind*=Math.exp(-rate);
   }}
   return [point[0],point[1],wind];
  });
 }
 function apply(event,recipe=groups[event.type][defaultIndex[event.type]],classify){
  const {vmax,...drivers}=recipe[1],next={...event,...drivers,startH:0,durationH:24};
  if(vmax!=null)next.track=weakenTrack(event.track,vmax,classify);
  return next;
 }
 function matches(event,recipe){return Object.entries(recipe[1]).every(([key,value])=>Math.abs((key==='vmax'?event.track?.[0]?.[2]:event[key])-Number(value))<1e-8);}
 // The shadow is a visual envelope, independent of track length or other points' wind.
 function shadowRadius(vmaxKt){return 8+Math.max(0,vmaxKt)*.9;}
 const api={groups,defaultIndex,coastIndex,weakenTrack,apply,matches,shadowRadius};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.FirePresets=api;
})(typeof window==='undefined'?globalThis:window);

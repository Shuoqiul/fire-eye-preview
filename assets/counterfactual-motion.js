'use strict';
/* Stationary radar clouds: a periodic ripple confined to the soft outer edge. */
(function(root){
 const finite=v=>typeof v==='number'&&Number.isFinite(v),frameCount=24;
 function defaults(){return {speed:30};}
 function normalize(m){
  const speed=m&&m.speed;
  if(!finite(speed)||speed<0||speed>100)throw Error('Cloud activity must be a number from 0 to 100.');
  return {speed};
 }
 function cycleMs(m){const {speed}=normalize(m);return speed?9000/(.4+speed/50):Infinity;}
 function frame(m,elapsed){
  const {speed}=normalize(m);
  if(!speed)return {key:0,next:0,mix:0,opacity:1,paused:true,position:0,dx:0,dy:0};
  const period=cycleMs(m),time=finite(elapsed)?elapsed:0,position=(((time%period)+period)%period)/period*frameCount,key=Math.min(frameCount-1,Math.floor(position));
  return {key,next:(key+1)%frameCount,mix:position-key,opacity:1,paused:false,position,dx:0,dy:0};
 }
 function contour(signedDistance,x,y,key,maxDistance){
  if(![signedDistance,x,y,key,maxDistance].every(finite)||maxDistance<=0)throw Error('Contour needs finite coordinates, phase and a positive maximum distance.');
  const band=Math.min(4.5,maxDistance*.34),ratio=signedDistance/band;
  if(Math.abs(ratio)>=1)return signedDistance;
  const phase=2*Math.PI*(((key%frameCount)+frameCount)%frameCount)/frameCount;
  const noise=.6*Math.sin(.19*x+.13*y+phase)+.27*Math.sin(.11*x-.21*y-phase)+.13*Math.sin(.08*x+.17*y+2*phase+1.2);
  const amplitude=Math.min(1.8,band*.46),envelope=(1-ratio*ratio)**2;
  return signedDistance+amplitude*envelope*noise;
 }
 // Premultiplied interpolation keeps identical interior RGBA values exact.
 function blendPixels(a,b,mix,out){
  if(a.length!==b.length||a.length!==out.length||a.length%4||!finite(mix)||mix<0||mix>1)throw Error('Pixel buffers and mix must match.');
  if(mix===0){out.set(a);return out;}if(mix===1){out.set(b);return out;}
  for(let i=0;i<a.length;i+=4){
   const aa=a[i+3]*(1-mix),bb=b[i+3]*mix,alpha=aa+bb;out[i+3]=Math.round(alpha);
   for(let j=0;j<3;j++)out[i+j]=alpha?Math.round((a[i+j]*aa+b[i+j]*bb)/alpha):0;
  }return out;
 }
 const api={defaults,normalize,frame,contour,frameCount,cycleMs,blendPixels};if(typeof module==='object'&&module.exports)module.exports=api;else root.FireMotion=api;
})(typeof window==='undefined'?globalThis:window);

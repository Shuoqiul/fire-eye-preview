'use strict';
/* Fixed-centre weather churn: six half-second contour keys and a half-second clear pause. */
(function(root){
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 function defaults(){return {speed:30};}
 function normalize(m){
  const speed=m&&m.speed;
  if(!finite(speed)||speed<0||speed>100)throw Error('Motion speed must be a number from 0 to 100.');
  return {speed};
 }
 function frame(m,elapsed){
  const {speed}=normalize(m);
  if(!speed)return {key:0,next:0,mix:0,opacity:1,paused:true,position:0,dx:0,dy:0};
  const time=(finite(elapsed)?elapsed:0)*(.4+speed/50),cycle=((time%3000)+3000)%3000,active=cycle<2500,position=active?Math.min(4.999,cycle/500):5,key=Math.min(5,Math.floor(position)),next=key===5?5:key+1,fraction=position-key,mix=key===5?0:fraction*fraction*(3-2*fraction);
  return {key,next,mix,opacity:active?1-position/5:0,paused:!active,position,dx:0,dy:0};
 }
 function noise(x,y,key){
  if(!x&&!y)return 0;
  const angle=Math.atan2(y,x),turn=key*.42;
  return .48*Math.sin(5*Math.cos(angle)+3*Math.sin(angle)+turn)+.32*Math.sin(9*Math.cos(angle)-4*Math.sin(angle)-turn*1.3+1.3)+.20*Math.sin(13*Math.cos(angle)+8*Math.sin(angle)+turn*.7);
 }
 function contour(signedDistance,x,y,key,maxDistance){
  if(![signedDistance,x,y,key,maxDistance].every(finite)||maxDistance<=0)throw Error('Contour needs finite coordinates, key and positive maxDistance.');
  if(key<=0)return signedDistance;
  const progress=key/5,edge=clamp(1-signedDistance/maxDistance,0,1),offset=maxDistance*edge*(.22*progress+.10*noise(x,y,key)*Math.sin(Math.PI*progress));
  return signedDistance+offset;
 }
 const api={defaults,normalize,frame,contour};if(typeof module==='object'&&module.exports)module.exports=api;else root.FireMotion=api;
})(typeof window==='undefined'?globalThis:window);

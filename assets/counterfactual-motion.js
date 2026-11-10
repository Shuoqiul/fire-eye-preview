'use strict';
/* Illustrative motion only: six half-second keyframes and a half-second empty pause. */
(function(root){
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 function defaults(){return {direction:Math.floor(Math.random()*360),speed:12};}
 function normalize(m){if(!m||!Number.isFinite(m.direction)||!Number.isFinite(m.speed))throw Error('Motion needs direction and speed.');return {direction:((m.direction%360)+360)%360,speed:clamp(m.speed,0,100)};}
 function frame(m,elapsed){m=normalize(m);const clock=((elapsed%3000)+3000)%3000,position=Math.min(5,clock/500),key=Math.floor(position),next=Math.min(5,key+1),fraction=position-key,mix=fraction*fraction*(3-2*fraction),progress=key+mix,step=Math.min(50,m.speed/2),angle=m.direction*Math.PI/180;
  return {key,next,mix,dx:Math.sin(angle)*step*progress,dy:-Math.cos(angle)*step*progress,opacity:1-progress/5,paused:clock>=2500,position,step};
 }
 const api={defaults,normalize,frame};if(typeof module==='object'&&module.exports)module.exports=api;else root.FireMotion=api;
})(typeof window==='undefined'?globalThis:window);

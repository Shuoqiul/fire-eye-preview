'use strict';
(function(root){
 const palettes=Object.freeze({heavy_rain:Object.freeze({rgb:[13,65,156],alpha:1}),thunderstorm:Object.freeze({rgb:[92,36,154],alpha:1}),prescribed_burn:Object.freeze({rgb:[137,12,30],alpha:.52})});
 function pixel(type,strength,intensity,inside,fade=1){
  const palette=palettes[type];if(!palette)throw Error('Choose an area event.');
  const band=Math.ceil(Math.max(0,Math.min(1,strength))*6)/6,level=band*(.35+.65*intensity),white=type==='prescribed_burn'?.10:.28;
  const rgb=palette.rgb.map(c=>Math.round(c+(255-c)*(1-level)*white));
  const alpha=(inside?.30+.60*level:.45*Math.max(0,strength))*Math.sqrt(Math.max(0,intensity))*palette.alpha*Math.max(0,Math.min(1,fade));
  return [...rgb,Math.round(255*(intensity>0?Math.max(0,Math.min(1,alpha)):0))];
 }
 const api={palettes,pixel};if(typeof module==='object'&&module.exports)module.exports=api;else root.FireArea=api;
})(typeof window==='undefined'?globalThis:window);

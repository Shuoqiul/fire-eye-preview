'use strict';
/* Compare-only legend and scale. Stored cell deltas and Scenario stay exact. */
(function(root){
  const SCALE=Object.freeze({limit:.1,extent:.1});
  const COLORS=Object.freeze([
    [-.1,[119,157,198]],
    [-.0261,[165,195,220]],
    [-.0005,[238,242,241]],
    [0,[247,247,241]],
    [.0005,[246,244,241]],
    [.0261,[249,220,220]],
    [.1,[225,119,113]]
  ]);
  const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
  function magnitude(delta){
    if(!Number.isFinite(delta))return null;
    return clamp(Math.abs(delta)/SCALE.limit,0,1);
  }
  function alpha(delta){
    const m=magnitude(delta);
    return m===null?0:.72*Math.pow(m,.86);
  }
  function colour(delta){
    const amount=magnitude(delta)===null?0:clamp(delta,-SCALE.limit,SCALE.limit);
    let lo=COLORS[0],hi=COLORS.at(-1);
    for(const stop of COLORS){if(stop[0]<=amount)lo=stop;if(stop[0]>=amount){hi=stop;break;}}
    const t=hi[0]===lo[0]?0:(amount-lo[0])/(hi[0]-lo[0]);
    return lo[1].map((v,i)=>Math.round(v+(hi[1][i]-v)*t));
  }
  const api=Object.freeze({SCALE,COLORS,magnitude,alpha,colour});
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FireCompareDisplay=api;
})(typeof window==='object'?window:globalThis);

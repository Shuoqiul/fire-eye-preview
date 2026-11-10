'use strict';
/* Published mechanism equations; mapping these to occupancy remains an uncalibrated scenario bridge. */
(function(root){
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 function windLogRatio(targetMph,referenceMph=10){return .05039*(targetMph-referenceMph)*1.609344;}
 function fineFuelFactor(m){m=clamp(m,0,250);return 91.9*Math.exp(-.1386*m)*(1+Math.pow(m,5.31)/49300000);}
 function rainMoisture(m,rainMm){
  m=clamp(m,0,250);if(rainMm<=.5)return m;
  const effective=rainMm-.5,wet=42.5*effective*Math.exp(-100/(251-m))*(-Math.expm1(-6.93/effective)),correction=m>150?.0015*(m-150)**2*Math.sqrt(effective):0;
  return Math.min(250,m+wet+correction);
 }
 function memoryStep(previous,increase,tauHours,activeHours=0,lagHours=0,stepHours=12){
  return previous*Math.exp(-stepHours/tauHours)+(activeHours>0?increase*tauHours/activeHours*(-Math.expm1(-activeHours/tauHours))*Math.exp(-lagHours/tauHours):0);
 }
 function lightningKernel(holdoverFraction=.153){
  // The total holdover fraction is WUS observational context; within-component timing is a design assumption.
  const kernel=Array(11).fill(holdoverFraction/7);kernel[0]=(1-holdoverFraction)*.75;kernel[1]=(1-holdoverFraction)*.25;kernel[2]=kernel[3]=0;return kernel;
 }
 function ignitionUnion(base,hazard){return base+(1-base)*(-Math.expm1(-Math.max(0,hazard)));}
 function treatmentMixture(base,treatedScore,fraction){const f=clamp(fraction,0,1),target=Math.min(base,treatedScore);return f===0?base:f===1?target:base+f*(target-base);}
 const defaults=Object.freeze({windCoupling:.25,rainCoupling:.35,initialMoisturePercent:16,rainTauHours:Object.freeze([1,10,100]),rainWeights:Object.freeze([.5,.35,.15]),lightningHazard:.04,rxLogOddsShift:-2,rxHalfLifeYears:8});
 const api={windLogRatio,fineFuelFactor,rainMoisture,memoryStep,lightningKernel,ignitionUnion,treatmentMixture,defaults};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.FireMethods=api;
})(typeof window==='undefined'?globalThis:window);

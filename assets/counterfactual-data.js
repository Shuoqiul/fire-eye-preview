'use strict';
/* Local-only research handoff: physical weather and immutable model references. */
(function(root){
 function decode(text,n,bytes){
  const raw=typeof Buffer==='function'?Uint8Array.from(Buffer.from(text,'base64')):Uint8Array.from(atob(text),c=>c.charCodeAt(0));
  if(raw.length!==n*bytes)throw Error('Research array has an unexpected size.');
  if(bytes===1)return raw;
  const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),out=new Float32Array(n);
  for(let i=0;i<n;i++)out[i]=view.getFloat32(i*4,true);return out;
 }
 function relativeHumidity(tC,tdC){
  if(!Number.isFinite(tC)||!Number.isFinite(tdC)||tC<=-243.5||tdC<=-243.5)throw Error('Humidity needs valid temperature and dewpoint.');
  return Math.min(100,Math.max(0,100*Math.exp(17.67*tdC/(tdC+243.5)-17.67*tC/(tC+243.5))));
 }
 function parse(data){
  if(data?.schemaVersion!==1||data.privateLocalSample!==true)throw Error('Choose a verified research sample.');
  const g=data.grid,n=g?.width*g?.height;
  if(!Number.isInteger(g?.width)||!Number.isInteger(g?.height)||!Number.isSafeInteger(n)||n<1||n>2000000||!Array.isArray(g.transform)||g.transform.length!==6||!g.transform.every(Number.isFinite)||g.proj4!=='EPSG:5070')throw Error('Research sample grid is invalid.');
  if(!Number.isFinite(Date.parse(data.issueTimeUtc))||Date.parse(data.targetTimeUtc)-Date.parse(data.issueTimeUtc)!==data.leadHours*3600000)throw Error('Research sample forecast clock differs.');
  const a={};for(const key of ['temperatureK','dewpointK','uMs','vMs','fuelCode','canopyCover','rawBaseline','publishedBaseline','publicationWeight'])a[key]=decode(data.arrays[key],n,4);
  a.validMask=decode(data.arrays.validMask,n,1);
  let valid=0;
  for(let i=0;i<n;i++)if(a.validMask[i]){
   valid++;
   for(const key of ['temperatureK','dewpointK','uMs','vMs','rawBaseline','publishedBaseline','publicationWeight'])if(!Number.isFinite(a[key][i]))throw Error('Research field contains invalid input.');
   if(a.temperatureK[i]<150||a.temperatureK[i]>350||a.dewpointK[i]<150||a.dewpointK[i]>350)throw Error('Temperature units must be K.');
   if(a.rawBaseline[i]<0||a.rawBaseline[i]>1||a.publishedBaseline[i]<0||a.publishedBaseline[i]>1)throw Error('Model reference values must be within [0,1].');
   if(a.publicationWeight[i]<0||a.publicationWeight[i]>1||Math.abs(publication(a.rawBaseline[i],a.publicationWeight[i],data.publication)-a.publishedBaseline[i])>2e-7)throw Error('Publication reference verification failed.');
  }
  if(valid!==data.verification?.validCells||data.verification?.publicationBitwiseEqual!==true)throw Error('Research sample verification differs.');
  const context={...data,fields:a};delete context.arrays;
  context.grid={...g,proj4:'+proj=aea +lat_0=23 +lon_0=-96 +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 +datum=NAD83 +units=m +no_defs'};
  context.windows=[{leadHours:data.leadHours,targetTime:data.targetTimeUtc,values:a.publishedBaseline}];
  context.weatherAt=(i)=>a.validMask[i]?{tempC:a.temperatureK[i]-273.15,rhPct:relativeHumidity(a.temperatureK[i]-273.15,a.dewpointK[i]-273.15),uMs:a.uMs[i],vMs:a.vMs[i],rainMm:0,initialFFMC:85}:null;
  return context;
 }
 function publication(raw,weight,parameters){
  if(weight<=0)return raw;
  const clip=Math.max(1e-6,Math.min(.999999,raw));return Math.min(parameters.cap,1/(1+Math.exp(-(Math.log(clip/(1-clip))+parameters.shift*weight))));
 }
 const api={parse,relativeHumidity,publication};if(typeof module==='object'&&module.exports)module.exports=api;else root.FireResearchData=api;
})(typeof window==='undefined'?globalThis:window);

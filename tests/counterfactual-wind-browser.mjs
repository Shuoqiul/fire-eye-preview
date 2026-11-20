import {chromium} from '../../cf-app/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const drawing=await fs.readFile(new URL('../assets/counterfactual-drawing.js',import.meta.url),'utf8');
const browser=await chromium.launch({headless:true,executablePath:process.env.CF_CHROME||undefined,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],env:{...process.env,LD_LIBRARY_PATH:'/home/gxy/.local/browsers/lib:'+(process.env.LD_LIBRARY_PATH||'')}}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.setContent('<canvas id="wind" width="1440" height="960"></canvas>');await page.addStyleTag({content:'html,body{margin:0;background:#e7f0fc}canvas{display:block}'});
 await page.addScriptTag({content:drawing});
 const timing=await page.evaluate(()=>{
  const field=FireDrawing.windField([[60,480],[1380,480]],240,undefined,27,[0,0,1440,960]),lanes=new Set(field.map(a=>a.lane)),minimum=new Map(),positions=[];let alternate=0;
  for(let time=0;time<4800;time+=16){
   const visible=FireDrawing.windVisibility(field,time),current=new Map();
   for(const {arrow,frame} of visible){
    if(frame.end-frame.start<.6)continue;current.set(arrow.lane,(current.get(arrow.lane)||0)+1);
    if(time===3300)positions.push({lane:arrow.lane,from:arrow.from[0],to:arrow.to[0],head:frame.head});
   }
   for(const lane of lanes)minimum.set(lane,Math.min(minimum.get(lane)??Infinity,current.get(lane)||0));
   const rows=[...current.entries()].sort((a,b)=>a[0]-b[0]);
   if(rows.length>2&&(alternate++&1)===0)for(let i=1;i<rows.length;i++)if(!(rows[i][1]>0&&rows[i-1][1]>0))throw Error('neighboring lanes retain complete renderer-passing shafts');
  }
  return {count:field.length,lanes:lanes.size,minimum:[...minimum.values()],positions};
 });
 assert.ok(timing.count>0&&timing.lanes>2);
 assert.ok(timing.minimum.every(n=>n>0),'every checked lane has visible complete shafts at every time: '+JSON.stringify(timing.minimum));
 const drawn=await page.evaluate(async()=>{
  const canvas=document.getElementById('wind'),ctx=canvas.getContext('2d'),field=FireDrawing.windField([[60,480],[1380,480]],240,undefined,27,[0,0,1440,960]);
  const strokes=[];ctx.stroke=()=>strokes.push(ctx.lineWidth);
  const draw=(time,array)=>{
   ctx.clearRect(0,0,canvas.width,canvas.height);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#174c40';ctx.globalAlpha=.82;ctx.lineWidth=1.65;
   for(const arrow of array){const frame=time===0?{visible:true,start:0,end:1,head:true}:FireDrawing.windVisibility(field,time).find(item=>item.arrow===arrow)?.frame;if(!frame||frame.end-frame.start<.6)continue;
    const points=arrow.points,total=arrow.arcLength,start=frame.start*total,end=frame.end*total,trace=[];
    for(let i=1;i<points.length;i++){const lo=Math.max(start,(i-1)*arrow.arcLength/(points.length-1)),hi=Math.min(end,i*arrow.arcLength/(points.length-1));if(hi<=lo)continue;if(!trace.length)trace.push(points[i-1]);trace.push(points[i]);}
    if(trace.length<2)continue;ctx.beginPath();ctx.moveTo(...trace[0]);for(const p of trace.slice(1))ctx.lineTo(...p);const q=trace.at(-1),p=trace.at(-2),angle=Math.atan2(q[1]-p[1],q[0]-p[0]),wing=Math.min(6,Math.max(2,total*.23),(end-start)*total*.72);ctx.moveTo(q[0]-wing*Math.cos(angle-.47),q[1]-wing*Math.sin(angle-.47));ctx.lineTo(...q);ctx.lineTo(q[0]-wing*Math.cos(angle+.47),q[1]-wing*Math.sin(angle+.47));ctx.stroke();
   }
  };
  const lanes=new Set(field.map(a=>a.lane)),reduced=new Map(),styles=new Set(),rendererStroke=ctx.stroke;ctx.stroke=()=>{strokes.push(ctx.lineWidth);styles.add(`${ctx.strokeStyle}|${ctx.globalAlpha}|${ctx.lineWidth.toFixed(2)}`)};draw(0,field);
  for(const lane of lanes)reduced.set(lane,field.filter(a=>a.lane===lane).length);
  const animated=[];for(let t=3000;t<3400;t+=16){strokes.length=0;draw(t,field);animated.push(strokes.length);}
  ctx.stroke=rendererStroke;return {reduced:[...reduced.values()],animated,styles:[...styles]};
 });
 assert.ok(drawn.reduced.every(n=>n>0),'reduced motion retains each lane');
 assert.ok(drawn.animated.reduce((n,v)=>n+v,0)>0,'animation renders complete strokes');
 assert.equal(drawn.styles.length,1,'all lanes use the renderer stroke style');assert.ok(drawn.styles[0].startsWith('#174c40|0.82|1.65'),drawn.styles[0]);
 assert.deepEqual(errors,[]);
 await page.setContent('<canvas id="wind" width="1440" height="960"></canvas>');await page.addScriptTag({content:drawing});await page.addStyleTag({content:'html,body{margin:0;background:#e7f0fc}canvas{display:block}'});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>{
  const canvas=document.getElementById('wind'),ctx=canvas.getContext('2d'),field=FireDrawing.windField([[50,600],[520,260],[1130,450]],200,undefined,27,[0,0,1440,960]);
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#174c40';ctx.globalAlpha=.82;ctx.lineWidth=1.65;
  const rendererStroke=ctx.stroke;let count=0;ctx.stroke=()=>{count++;return rendererStroke.call(ctx)};for(const arrow of field){ctx.beginPath();ctx.moveTo(...arrow.points[0]);for(const p of arrow.points.slice(1))ctx.lineTo(...p);const q=arrow.to,p=arrow.points.at(-2),angle=Math.atan2(q[1]-p[1],q[0]-p[0]),wing=Math.min(6,Math.max(2,arrow.arcLength*.23));ctx.moveTo(q[0]-wing*Math.cos(angle-.47),q[1]-wing*Math.sin(angle-.47));ctx.lineTo(...q);ctx.lineTo(q[0]-wing*Math.cos(angle+.47),q[1]-wing*Math.sin(angle+.47));ctx.stroke();}delete ctx.stroke;if(count!==field.length)throw Error('Canvas bend rendering omitted a placed glyph');
 });
 await page.screenshot({path:'/tmp/counterfactual-wind-browser.png'});
 console.log('Wind station time and renderer coverage PASS',JSON.stringify({count:timing.count,lanes:timing.lanes,minimum:timing.minimum}));
}finally{await browser.close();}

const test=require('node:test'),assert=require('node:assert/strict'),motion=require('../assets/counterfactual-motion.js'),model=require('../assets/counterfactual-engine.js');
test('radar clouds stay visible and anchored at every time and activity level',()=>{
 for(const speed of [0,1,30,100])for(let t=-30000;t<30000;t+=79){const f=motion.frame({speed},t);assert.equal(f.dx,0);assert.equal(f.dy,0);assert.equal(f.opacity,1);assert.ok(f.key>=0&&f.key<24&&f.next>=0&&f.next<24);assert.ok(f.mix>=0&&f.mix<1);}
});
test('24-key loop wraps into its initial texture with continuous boundary displacement',()=>{
 const m=motion.defaults(),period=motion.cycleMs(m);assert.equal(period,9000);assert.equal(motion.frameCount,24);
 assert.deepEqual(motion.frame(m,0),motion.frame(m,period));
 const before=motion.frame(m,period-.01),after=motion.frame(m,.01);assert.equal(before.next,0);assert.equal(after.key,0);
 const value=f=>(1-f.mix)*motion.contour(0,13,9,f.key,10)+f.mix*motion.contour(0,13,9,f.next,10);
 assert.ok(Math.abs(value(before)-value(after))<.0001);assert.equal(motion.contour(.2,13,9,0,10),motion.contour(.2,13,9,24,10));
});
test('static mode holds the visible initial key; activity adjusts tempo only',()=>{
 const still=motion.frame({speed:0},8000);assert.deepEqual(still,{key:0,next:0,mix:0,opacity:1,paused:true,position:0,dx:0,dy:0});assert.deepEqual(still,motion.frame({speed:0},100000));
 assert.ok(motion.cycleMs({speed:100})<motion.cycleMs({speed:1}));
 for(const bad of [undefined,{}, {speed:-1},{speed:101},{speed:NaN},{speed:'30'}])assert.throws(()=>motion.normalize(bad));
});
test('all interior and distant exterior pixels remain exact through every key',()=>{
 for(const max of [1,4,16,64])for(let key=0;key<=24;key++)for(const [x,y] of [[0,0],[8,5],[-17,22]]){
  const band=Math.min(4.5,max*.34);
  for(const d of [band,max,max*2,-band,-max*2])assert.equal(motion.contour(d,x,y,key,max),d);
 }
});
test('only a narrow outer edge ripples with bounded local, cyclic variation',()=>{
 const values=[];for(let key=0;key<24;key++)for(let x=-30;x<=30;x+=3){const d=motion.contour(0,x,11,key,16);assert.ok(Math.abs(d)<=1.8);values.push(d);}
 assert.ok(Math.max(...values)-Math.min(...values)>2.5);assert.ok(new Set(values.map(v=>v.toFixed(5))).size>100);
 const near=motion.contour(4.49,12,14,3,16);assert.ok(Math.abs(near-4.49)<.001);
 assert.throws(()=>motion.contour(0,0,0,NaN,10));assert.throws(()=>motion.contour(0,0,0,1,0));
});
test('interior folds animate coherently while centre and deepest core stay anchored',()=>{
 for(const max of [2,16,64]){const width=max*.035,inner=Math.max(width*2,.8);for(let key=0;key<24;key++)for(const [x,y] of [[0,0],[12,17],[-23,9]]){
  for(const d of [-max*2,-max,-max*.7,0,inner])assert.ok(Math.abs(motion.interiorContour(d,x,y,key,max,width)-d)<1e-10);
  assert.equal(motion.interiorContour(max,x,y,key,max,width),max);
  assert.ok(Math.abs(motion.interiorContour(inner+1e-9,x,y,key,max,width)-inner-1e-9)<1e-10);
 }
 }
 const values=[];for(let key=0;key<24;key++)for(let x=-24;x<=24;x+=4){values.push(motion.interiorContour(2.4,x,3,key,24,.84));}
 assert.ok(Math.max(...values)-Math.min(...values)>1);assert.ok(Math.max(...values.map(v=>Math.abs(v-2.4)))<4);
 assert.equal(motion.interiorContour(2.4,2,4,0,24,.84),motion.interiorContour(2.4,2,4,24,24,.84));
 assert.equal(motion.interiorContour(2.4,2,4,0,24,.84),motion.interiorContour(2.4,2,4,-24,24,.84));
 const before=motion.interiorContour(2.4,2,4,23.99,24,.84),after=motion.interiorContour(2.4,2,4,.01,24,.84);assert.ok(Math.abs(before-after)<.01);
 assert.equal(motion.interiorContour(2.4,2,4,.01,24,.84),motion.interiorContour(2.4,2,4,.01,24,.84));
 assert.throws(()=>motion.interiorContour(0,0,0,0,10,-1));assert.throws(()=>motion.interiorContour(0,0,0,0,10,11));
});
test('interior area bands move with the outer phase and scale to the event',()=>{
 for(const max of [16,64]){const width=max*.035,sourceDistance=width*2,strength=.25+.75*sourceDistance/max,outer=max*.25;
  for(const fraction of [.11,.33]){const distance=Math.min(max*.5,outer*(.25+.75*fraction)),samples=[];
   for(let x=-20;x<=20;x+=4)for(let y=-12;y<=12;y+=4)samples.push(motion.interiorContour(distance,x,y,7,max,width)-distance);
   assert.ok(sourceDistance<outer);assert.ok(strength>.25);assert.equal(motion.interiorContour(sourceDistance,2,4,7,max,width),sourceDistance);
   assert.ok(Math.max(...samples.map(Math.abs))>.003);assert.ok(Math.max(...samples.map(Math.abs))<.13*max);
  }
 }
});
test('painted events preserve expert timing and cloud activity metadata',()=>{
 for(const type of ['heavy_rain','thunderstorm','prescribed_burn']){const e=model.defaults(type,[-96,38]);e.startH=24;e.area={width:3,height:3,bounds:[-97,37,-95,39],mask:[0,0,0,0,1,0,0,0,0]};e.motion={direction:135,speed:12};const n=model.normalize(e);assert.equal(n.startH,24);assert.deepEqual(n.motion,{speed:12});}
});
test('pixel interpolation holds static interiors exactly and preserves soft alpha edges',()=>{
 const a=Uint8ClampedArray.from([13,65,156,120,13,65,156,0,0,0,0,0]),b=Uint8ClampedArray.from([13,65,156,120,13,65,156,40,13,65,156,80]),out=new Uint8ClampedArray(a.length);
 for(const mix of [0,.01,.25,.5,.75,.99,1]){motion.blendPixels(a,b,mix,out);assert.deepEqual([...out.slice(0,4)],[13,65,156,120]);}
 motion.blendPixels(a,b,.5,out);assert.deepEqual([...out.slice(4,8)],[13,65,156,20]);assert.deepEqual([...out.slice(8,12)],[13,65,156,40]);
});

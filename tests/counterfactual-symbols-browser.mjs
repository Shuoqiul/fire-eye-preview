import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'../../cf-app/node_modules/playwright/index.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.CF_FIXTURE_PORT||5233),base='http://127.0.0.1:'+port+'/tests/counterfactual-symbols-browser.html';
const server=spawn(process.execPath,['-e',`
 const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),root=${JSON.stringify(root)};
 const types={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
 http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);});}).listen(${port},'127.0.0.1');
`],{stdio:['ignore','ignore','pipe']});
const errors=[];
try{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:320,height:240}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(()=>document.querySelectorAll('.cf-lightning-silhouette,.cf-rain-cloud-0').length===2);
  assert.equal(await page.locator('.cf-lightning-silhouette').count(),1);
  assert.equal(await page.locator('.cf-rain-cloud').count(),3);
  assert.equal(await page.locator('.cf-rain-drop [transform]').count(),4);
  assert.equal(await page.locator('.cf-rain-drop').count(),4);
  const lightning=await page.evaluate(()=>{
   const el=document.querySelector('.cf-lightning-silhouette');
   const read=t=>{for(const a of el.getAnimations()){a.pause();a.currentTime=t;}const s=getComputedStyle(el);return{clip:s.clipPath,opacity:Number(s.opacity)};};
   return [read(0),read(500),read(800)];
  });
  assert.match(lightning[0].clip,/inset\(0(?:px)? 0(?:px)? 100%/);
  assert.match(lightning[1].clip,/(?:inset\(0px\)|inset\(0px 0px 0px\))/);
  assert.ok(lightning[1].opacity>lightning[0].opacity);
  assert.ok(lightning[2].opacity<lightning[1].opacity);
  await page.waitForTimeout(100);
  const active=await page.evaluate(()=>{const clouds=[...document.querySelectorAll('.cf-rain-cloud')],drops=[...document.querySelectorAll('.cf-rain-drop')],outline=clouds[0].querySelector('path');return {poses:clouds.map(el=>{const s=getComputedStyle(el);return{opacity:Number(s.opacity),transform:s.transform};}),drops:drops.map(el=>{const s=getComputedStyle(el),path=el.querySelector('path');return{transform:s.transform,opacity:Number(s.opacity),delay:s.animationDelay,path:path.getAttribute('transform')};}),outline:{d:outline.getAttribute('d'),wet:getComputedStyle(outline).stroke,fill:getComputedStyle(clouds[0].parentElement).fill},keyframes:[...document.styleSheets].flatMap(s=>[...s.cssRules]).filter(r=>r.name==='cf-rain-pose').map(r=>[...r.cssRules].map(f=>f.cssText)),dropKeyframes:[...document.styleSheets].flatMap(s=>[...s.cssRules]).filter(r=>r.name==='cf-rain-fall').map(r=>[...r.cssRules].map(f=>f.cssText))};});
  assert.ok(active.poses.every(p=>p.opacity>=0&&p.opacity<=1));
  assert.ok(active.poses.some(p=>p.transform!=='none'));
  assert.equal(new Set(active.drops.map(drop=>drop.delay)).size,4);
  assert.equal(new Set(active.drops.map(drop=>drop.transform)).size,4);
  assert.ok(new Set(active.drops.map(drop=>drop.opacity)).size>1);
  assert.ok(active.drops.every(drop=>/^translate\(/.test(drop.path)));
  assert.ok(active.dropKeyframes.flat().some(frame=>/translateY\(5px\)/.test(frame)));
  const sampledDrops=await page.evaluate(()=>{
   const drops=[...document.querySelectorAll('.cf-rain-drop')];
   for(const drop of drops){for(const animation of drop.getAnimations()){animation.pause();animation.currentTime=500;}}
   return drops.map(drop=>{const s=getComputedStyle(drop);return {transform:s.transform,opacity:Number(s.opacity),delay:s.animationDelay};});
  });
  assert.equal(new Set(sampledDrops.map(drop=>drop.opacity)).size,4,'each drop has its own fall phase');
  assert.equal(new Set(sampledDrops.map(drop=>drop.transform)).size,4,'each drop has its own fall offset');
  assert.match(active.outline.d,/^M1 10/);
  assert.equal(active.outline.wet,'rgb(7, 95, 168)');
  assert.equal(active.outline.fill,'rgb(7, 95, 168)');
  assert.ok(active.keyframes[0].some(frame=>/0%, 32%/.test(frame)&&/opacity: 1/.test(frame)&&/rotate\(-2deg\)/.test(frame)));
  assert.ok(active.keyframes[0].some(frame=>/33\.001%, 65%/.test(frame)&&/rotate\(2deg\)/.test(frame)));
  assert.ok(active.keyframes[0].some(frame=>/66\.001%, 98%/.test(frame)&&/rotate\(0deg\)/.test(frame)));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.reload();
  const still=await page.evaluate(()=>{
   const lightning=document.querySelector('.cf-lightning-silhouette'),cloud=document.querySelector('.cf-rain-cloud-0'),drops=[...document.querySelectorAll('.cf-rain-drop')];
   return [lightning,cloud,...drops].map(el=>{const s=getComputedStyle(el);return{name:s.animationName,opacity:s.opacity,clip:s.clipPath,transform:s.transform};});
  });
  assert.ok(still.every(s=>s.name==='none'&&Number(s.opacity)===1&&s.clip==='none'&&s.transform==='none'));
  await page.screenshot({path:'/tmp/cf-symbol-motion-reduced.png'});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.reload();
  assert.ok(await page.evaluate(()=>[...document.getAnimations()].some(a=>a.animationName==='cf-lightning-reveal')));
  assert.equal(errors.length,0);
  console.log('Lightning top-to-bottom reveal, rain cloud poses, falling drops, original outlines and reduced-motion static state PASS');
 }finally{await browser.close();}
}finally{server.kill();}

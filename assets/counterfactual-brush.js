'use strict';
/* One-stroke paths and editable area masks, captured in the current map viewport. */
window.FireBrush=class FireBrush {
  constructor({map,onConfirm,onStatus}){this.map=map;this.onConfirm=onConfirm;this.onStatus=onStatus;this.active=false;}
  open(kind){
    this.close();this.active=true;this.kind=kind;this.points=[];this.mode='brush';this.brushSize=32;this.eraserSize=32;this.hasPath=false;
    this.map.jumpTo({bearing:0,pitch:0});this.pan=this.map.dragPan.isEnabled();this.map.dragPan.disable();this.scroll=this.map.scrollZoom.isEnabled();this.map.scrollZoom.disable();this.touch=this.map.touchZoomRotate.isEnabled();this.map.touchZoomRotate.disable();this.double=this.map.doubleClickZoom.isEnabled();this.map.doubleClickZoom.disable();
    const host=this.map.getContainer(),r=host.getBoundingClientRect();this.canvas=document.createElement('canvas');this.canvas.width=Math.round(r.width);this.canvas.height=Math.round(r.height);this.canvas.className='cf-brush-canvas';this.canvas.setAttribute('aria-label',kind==='path'?'Draw one event path':'Paint an event area');host.append(this.canvas);this.ctx=this.canvas.getContext('2d',{willReadFrequently:true});
    this.tools=document.createElement('section');this.tools.className='cf-brush-tools panel';this.tools.setAttribute('aria-label','Drawing tools');
    const add=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;this.tools.append(b);return b;};
    const info=document.createElement('p');info.textContent=kind==='path'?'Draw one direction arrow, then confirm or redraw.':'Paint the affected area. Use the eraser to shape the boundary.';this.tools.append(info);
    if(kind==='area'){
      const sizes=document.createElement('div');sizes.className='cf-brush-sizes';this.tools.append(sizes);
      for(const [type,label] of [['brush','Brush'],['eraser','Eraser']]){const group=document.createElement('label'),b=document.createElement('button'),slider=document.createElement('input');b.type='button';b.textContent=label;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',type===this.mode);b.onclick=()=>{this.mode=type;for(const item of sizes.querySelectorAll('button'))item.setAttribute('aria-pressed',item===b);};slider.type='range';slider.min=8;slider.max=100;slider.value=32;slider.setAttribute('aria-label',label+' size');slider.oninput=()=>this[type+'Size']=Number(slider.value);slider.onwheel=e=>{e.preventDefault();slider.value=Math.max(8,Math.min(100,Number(slider.value)+(e.deltaY<0?4:-4)));slider.oninput();};group.append(b,slider);sizes.append(group);}
    }
    this.confirm=add('Confirm',()=>this.finish());this.confirm.disabled=true;
    add('Redraw',()=>{this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.points=[];this.hasPath=false;this.confirm.disabled=true;});add('Cancel',()=>this.close());document.body.append(this.tools);
    this.canvas.onpointerdown=e=>{if(kind==='path'&&this.hasPath)return;this.pressed=true;this.canvas.setPointerCapture(e.pointerId);const p=this.position(e);if(kind==='path'){this.points=[p];this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);}else this.dab(p,p);this.last=p;};
    this.canvas.onpointermove=e=>{if(!this.pressed)return;const p=this.position(e);if(kind==='path'){if(Math.hypot(p[0]-this.last[0],p[1]-this.last[1])<3)return;this.points.push(p);this.drawPath(false);}else this.dab(this.last,p);this.last=p;};
    this.canvas.onpointerup=()=>{if(!this.pressed)return;this.pressed=false;if(kind==='path'){if(this.points.length<2)return;this.points=FireDrawing.smooth(this.points);this.hasPath=true;this.drawPath(true);}this.confirm.disabled=false;};
    this.canvas.onpointercancel=()=>{this.pressed=false;};
    this.escape=e=>{if(e.key==='Escape')this.close();};window.addEventListener('keydown',this.escape);this.onStatus?.('Drawing mode · Confirm applies the shape; Cancel preserves the event.');
  }
  position(e){const r=this.canvas.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];}
  dab(a,b){const c=this.ctx;c.globalCompositeOperation=this.mode==='eraser'?'destination-out':'source-over';c.lineCap='round';c.lineJoin='round';c.lineWidth=this[this.mode+'Size']*2;c.strokeStyle='#4d89b8';c.fillStyle='#4d89b8';c.beginPath();c.moveTo(...a);c.lineTo(...b);c.stroke();c.beginPath();c.arc(b[0],b[1],c.lineWidth/2,0,Math.PI*2);c.fill();c.globalCompositeOperation='source-over';}
  drawPath(arrow){const c=this.ctx,p=this.points;c.clearRect(0,0,this.canvas.width,this.canvas.height);c.lineWidth=4;c.strokeStyle='#194d3f';c.lineCap='round';c.beginPath();p.forEach((q,i)=>i?c.lineTo(...q):c.moveTo(...q));c.stroke();if(arrow&&p.length>1){const a=p.at(-2),b=p.at(-1),angle=Math.atan2(b[1]-a[1],b[0]-a[0]);c.beginPath();c.moveTo(b[0]-18*Math.cos(angle-.5),b[1]-18*Math.sin(angle-.5));c.lineTo(...b);c.lineTo(b[0]-18*Math.cos(angle+.5),b[1]-18*Math.sin(angle+.5));c.stroke();}}
  finish(){
    if(this.kind==='path'){if(this.points.length<2)return;const guide=FireDrawing.sample(this.points,48).map(p=>this.map.unproject(p).toArray());this.close();this.onConfirm({kind:'path',guide});return;}
    const w=this.canvas.width,h=this.canvas.height,rgba=this.ctx.getImageData(0,0,w,h).data;let x0=w,y0=h,x1=0,y1=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(rgba[(y*w+x)*4+3]>96){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
    if(x1<=x0||y1<=y0){this.onStatus?.('Paint an area before confirming.');return;}
    // Axis-aligned screen capture matches Mercator while the drawing camera is locked.
    const size=Math.max(x1-x0+1,y1-y0+1),padding=Math.ceil(size*.15);x0-=padding;y0-=padding;x1+=padding;y1+=padding;
    const width=Math.max(8,Math.round((x1-x0)/Math.max(x1-x0,y1-y0)*128)),height=Math.max(8,Math.round((y1-y0)/Math.max(x1-x0,y1-y0)*128)),mask=[];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const sx=Math.floor(x0+(x+.5)*(x1-x0)/width),sy=Math.floor(y0+(y+.5)*(y1-y0)/height);mask.push(sx>=0&&sy>=0&&sx<w&&sy<h&&rgba[(sy*w+sx)*4+3]>96?1:0);}
    const nw=this.map.unproject([x0,y0]),se=this.map.unproject([x1,y1]),area={width,height,bounds:[nw.lng,se.lat,se.lng,nw.lat],mask};this.close();this.onConfirm({kind:'area',area});
  }
  close(){if(!this.active)return;this.active=false;this.pressed=false;this.canvas?.remove();this.tools?.remove();if(this.pan)this.map.dragPan.enable();if(this.scroll)this.map.scrollZoom.enable();if(this.touch)this.map.touchZoomRotate.enable();if(this.double)this.map.doubleClickZoom.enable();window.removeEventListener('keydown',this.escape);}
};

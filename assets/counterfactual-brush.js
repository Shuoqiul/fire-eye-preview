'use strict';
/* The drawing is stored in Mercator coordinates so the wheel can zoom the live preview. */
window.FireBrush=class FireBrush {
  constructor({map,onConfirm,onStatus}){this.map=map;this.onConfirm=onConfirm;this.onStatus=onStatus;this.active=false;}
  open(kind){
    this.close();this.active=true;this.kind=kind;this.points=[];this.dabs=[];this.mode='brush';this.brushSize=32;this.eraserSize=32;this.hasPath=false;
    this.map.jumpTo({bearing:0,pitch:0});this.pan=this.map.dragPan.isEnabled();this.map.dragPan.disable();this.scroll=this.map.scrollZoom.isEnabled();this.map.scrollZoom.enable();this.touch=this.map.touchZoomRotate.isEnabled();this.map.touchZoomRotate.disable();this.double=this.map.doubleClickZoom.isEnabled();this.map.doubleClickZoom.disable();
    const host=this.map.getContainer(),r=host.getBoundingClientRect();this.canvas=document.createElement('canvas');this.canvas.width=Math.round(r.width);this.canvas.height=Math.round(r.height);this.canvas.className='cf-brush-canvas';this.canvas.setAttribute('aria-label',kind==='path'?'Draw one event path':'Paint an event area');host.append(this.canvas);this.ctx=this.canvas.getContext('2d');
    this.camera=()=>{
      const r=this.canvas.getBoundingClientRect(),w=Math.round(r.width),h=Math.round(r.height);
      if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
      this.redraw();
    };
    this.map.on('move',this.camera);this.map.on('resize',this.camera);
    this.canvas.onwheel=e=>{
      e.preventDefault();e.stopPropagation();
      this.map.getCanvasContainer().dispatchEvent(new WheelEvent('wheel',{
        bubbles:true,cancelable:true,clientX:e.clientX,clientY:e.clientY,deltaX:e.deltaX,deltaY:e.deltaY,deltaMode:e.deltaMode,ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey,metaKey:e.metaKey
      }));
    };
    this.tools=document.createElement('section');this.tools.className='cf-brush-tools panel';this.tools.setAttribute('aria-label','Drawing tools');
    const add=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;this.tools.append(b);return b;};
    const info=document.createElement('p');info.textContent=kind==='path'?'Draw one direction arrow, then confirm or redraw.':'Paint the affected area. Use the eraser to shape the boundary.';this.tools.append(info);
    if(kind==='area'){
      const sizes=document.createElement('div');sizes.className='cf-brush-sizes';this.tools.append(sizes);
      for(const [type,label] of [['brush','Brush'],['eraser','Eraser']]){const group=document.createElement('label'),b=document.createElement('button'),slider=document.createElement('input');b.type='button';b.textContent=label;b.setAttribute('aria-label',label);b.setAttribute('aria-pressed',type===this.mode);b.onclick=()=>{this.mode=type;for(const item of sizes.querySelectorAll('button'))item.setAttribute('aria-pressed',item===b);};slider.type='range';slider.min=8;slider.max=100;slider.value=32;slider.setAttribute('aria-label',label+' size');slider.oninput=()=>this[type+'Size']=Number(slider.value);slider.onwheel=e=>{e.preventDefault();slider.value=Math.max(8,Math.min(100,Number(slider.value)+(e.deltaY<0?4:-4)));slider.oninput();};group.append(b,slider);sizes.append(group);}
    }
    this.confirm=add('Confirm',()=>this.finish());this.confirm.disabled=true;
    add('Redraw',()=>{this.points=[];this.dabs=[];this.hasPath=false;this.redraw();this.confirm.disabled=true;});add('Cancel',()=>this.close());document.body.append(this.tools);
    this.canvas.onpointerdown=e=>{
      if(kind==='path'&&this.hasPath)return;
      this.pressed=true;this.canvas.setPointerCapture(e.pointerId);const px=this.position(e),p=this.world(px);
      if(kind==='path'){this.points=[p];this.redraw();}else this.dab(p,p,px);
      this.last=p;
    };
    this.canvas.onpointermove=e=>{
      if(!this.pressed)return;const px=this.position(e),p=this.world(px);
      if(kind==='path'){
        const last=this.screen(this.last);if(Math.hypot(px[0]-last[0],px[1]-last[1])<3)return;
        this.points.push(p);this.redraw();
      }else this.dab(this.last,p,px);
      this.last=p;
    };
    this.canvas.onpointerup=()=>{if(!this.pressed)return;this.pressed=false;if(kind==='path'){if(this.points.length<2)return;this.hasPath=true;this.redraw();}this.confirm.disabled=false;};
    this.canvas.onpointercancel=()=>{this.pressed=false;};
    this.escape=e=>{if(e.key!=='Escape')return;e.preventDefault();e.stopImmediatePropagation();this.close();};window.addEventListener('keydown',this.escape,true);this.onStatus?.('Drawing mode · Scroll to zoom; Confirm applies the shape.');
  }
  position(e){const r=this.canvas.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];}
  world(px){const p=maplibregl.MercatorCoordinate.fromLngLat(this.map.unproject(px));return[p.x,p.y];}
  lngLat([x,y]){return new maplibregl.MercatorCoordinate(x,y).toLngLat();}
  screen(p){const q=this.map.project(this.lngLat(p));return[q.x,q.y];}
  paint(ctx,dab,project,radius){
    const a=project(dab.a),b=project(dab.b);
    ctx.globalCompositeOperation=dab.erase?'destination-out':'source-over';ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=2*radius;ctx.strokeStyle='#4d89b8';ctx.fillStyle='#4d89b8';
    ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();ctx.beginPath();ctx.arc(b[0],b[1],radius,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='source-over';
  }
  dab(a,b,px){
    const radius=this[this.mode+'Size'],step=this.world([px[0]+radius,px[1]]);
    const dot={a,b,r:Math.abs(step[0]-b[0]),erase:this.mode==='eraser'};
    this.dabs.push(dot);this.paint(this.ctx,dot,p=>this.screen(p),radius);
  }
  redraw(){
    this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    if(this.kind==='area'){
      for(const dot of this.dabs){
        const p=this.screen(dot.b),q=this.screen([dot.b[0]+dot.r,dot.b[1]]);
        this.paint(this.ctx,dot,a=>this.screen(a),Math.abs(q[0]-p[0]));
      }
      return;
    }
    const c=this.ctx,screen=this.points.map(p=>this.screen(p)),p=this.hasPath?FireDrawing.smooth(screen):screen;
    c.lineWidth=4;c.strokeStyle='#194d3f';c.lineCap='round';c.beginPath();p.forEach((q,i)=>i?c.lineTo(...q):c.moveTo(...q));c.stroke();
    if(this.hasPath&&p.length>1){const a=p.at(-2),b=p.at(-1),angle=Math.atan2(b[1]-a[1],b[0]-a[0]);c.beginPath();c.moveTo(b[0]-18*Math.cos(angle-.5),b[1]-18*Math.sin(angle-.5));c.lineTo(...b);c.lineTo(b[0]-18*Math.cos(angle+.5),b[1]-18*Math.sin(angle+.5));c.stroke();}
  }
  finish(){
    if(this.kind==='path'){
      if(this.points.length<2)return;
      const guide=FireDrawing.sample(FireDrawing.smooth(this.points.map(p=>this.screen(p))),48).map(p=>this.map.unproject(p).toArray());
      this.close();this.onConfirm({kind:'path',guide});return;
    }
    let west=Infinity,north=Infinity,east=-Infinity,south=-Infinity;
    for(const dot of this.dabs)if(!dot.erase)for(const [x,y] of [dot.a,dot.b]){west=Math.min(west,x-dot.r);east=Math.max(east,x+dot.r);north=Math.min(north,y-dot.r);south=Math.max(south,y+dot.r);}
    const size=Math.max(east-west,south-north);
    if(!(size>0)){this.onStatus?.('Paint an area before confirming.');return;}
    const pad=size*.15;west-=pad;east+=pad;north-=pad;south+=pad;
    const width=Math.max(8,Math.round((east-west)/(size+2*pad)*128)),height=Math.max(8,Math.round((south-north)/(size+2*pad)*128));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d'),sx=width/(east-west),sy=height/(south-north);
    for(const dot of this.dabs)this.paint(ctx,dot,([x,y])=>[(x-west)*sx,(y-north)*sy],dot.r*Math.min(sx,sy));
    const rgba=ctx.getImageData(0,0,width,height).data,mask=Array.from({length:width*height},(_,i)=>rgba[i*4+3]>96?1:0);
    if(!mask.includes(1)){this.onStatus?.('Paint an area before confirming.');return;}
    const nw=this.lngLat([west,north]),se=this.lngLat([east,south]);const area={width,height,bounds:[nw.lng,se.lat,se.lng,nw.lat],mask};this.close();this.onConfirm({kind:'area',area});
  }
  close(){
    if(!this.active)return;this.active=false;this.pressed=false;this.map.off('move',this.camera);this.map.off('resize',this.camera);this.canvas?.remove();this.tools?.remove();if(this.pan)this.map.dragPan.enable();if(!this.scroll)this.map.scrollZoom.disable();if(this.touch)this.map.touchZoomRotate.enable();if(this.double)this.map.doubleClickZoom.enable();window.removeEventListener('keydown',this.escape,true);
  }
};

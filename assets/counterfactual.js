'use strict';
/* Fire Eye integration: published native grids, one normalized event, scoped map tools. */
(() => {
  const model=window.FireCounterfactual, $=id=>document.getElementById(id);
  const events={hurricane:'Hurricane',thunderstorm:'Thunderstorm',high_wind:'High wind',heavy_rain:'Heavy rain',prescribed_burn:'Prescribed burn'};
  const presets=FirePresets.groups;
  const state={open:false,event:null,result:null,view:'change',mode:'everyone',windowIndex:0,status:'idle'};
  let panel,output,status,token=0,grid,features=[],geoKey='',saved,drag=null,drawing=null,suppressClick=false,brush=null,animation=0,icons=[],windArrows=[],areaImage=null,stormSymbols=[],coast=null,coastReady=null;
  const S=()=>window.fireEyePreview;
  const fc=features=>({type:'FeatureCollection',features});
  const feature=(geometry,kind,properties={})=>({type:'Feature',geometry,properties:{kind,...properties}});
  const line=(coordinates,kind)=>feature({type:'LineString',coordinates},kind);
  const score=x=>Number.isFinite(x)?x.toFixed(4):'—';
  const signed=x=>Number.isFinite(x)?(x>0?'+':'')+x.toFixed(4):'—';
  const date=x=>new Date(x).toLocaleString('en-GB',{timeZone:'UTC',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})+' UTC';
  const node=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
  const button=(text,action,cls='cf-secondary')=>{const n=node('button',text,cls);n.type='button';n.onclick=action;return n;};
  function message(text,kind=''){state.status=text;if(status){status.textContent=text;status.dataset.kind=kind;}}
  function normalized(value){return model.normalize(value);}
  async function loadCoast(){
    coastReady||=fetch('assets/land.geojson').then(r=>{if(!r.ok)throw Error('Coastline unavailable');return r.json();}).then(data=>{coast=FirePresets.coastIndex(data);}).catch(()=>{coastReady=null;});
    await coastReady;
  }
  function defaults(type,center){
    const map=S()?.map,c=map?.getCenter(),view=center||(()=>{if(type==='hurricane'&&map){const r=map.getContainer().getBoundingClientRect();const q=map.unproject([innerWidth>640?(Math.min(700,r.width*.5)+r.width)/2:r.width/2,innerWidth>640?r.height/2:r.height*.78]);return[q.lng,q.lat];}return[c?.lng||-96,c?.lat||38];})(),e=model.defaults(type,view);
    if(type==='hurricane'&&window.FireDrawing){e.track=FireDrawing.coastalTrack(view,map?.getZoom()||4);e.center=e.track[0].slice(0,2);}
    if(['heavy_rain','thunderstorm','prescribed_burn'].includes(type))e.area=defaultArea(e);
    if(type==='high_wind')e.radiusKm=50;
    if(type==='high_wind')e.windPath=[move(e.center,e.windFromDeg,150),move(e.center,(e.windFromDeg+180)%360,150)];
    return FirePresets.apply(e,undefined,coast||undefined);
  }
  function defaultArea(e){const radius=e.radiusKm,nw=move(e.center,315,radius*1.8),se=move(e.center,135,radius*1.8),width=80,height=80,mask=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++)mask.push(Math.hypot(x-39.5,y-39.5)<28?1:0);return {width,height,bounds:[nw[0],se[1],se[0],nw[1]],mask};}

  function invalidate(text='Parameters updated. Run to refresh the comparison.') {
    token++;state.result=null;features=[];geoKey='';if(output)output.hidden=true;
    if($('cf-run'))$('cf-run').disabled=false;
    S()?.map?.getSource('cf-result')?.setData(fc([]));message(text);paint();
  }
  function publicEvent(value){
    if(state.mode!=='everyone')return value;
    const next={...value,startH:0,durationH:24};
    if(next.type==='high_wind')next.radiusKm=Math.max(10,Math.min(100,next.radiusKm));
    if(next.type==='hurricane'&&next.track)next.track=FirePresets.weakenTrack(next.track,next.track[0][2],coast||undefined);
    return next;
  }
  function setEvent(value){state.event=normalized(publicEvent(value));invalidate();if(state.open){controls();geometry();}}
  function change(patch){try{setEvent({...state.event,...patch});}catch(e){message(e.message,'error');controls();}}
  function build() {
    if(panel)return;
    panel=node('aside','','panel cf-panel');panel.id='cf-panel';panel.setAttribute('aria-label','Counterfactual predictor');
    const head=node('header','','cf-head'),title=node('div');title.append(node('div','SCENARIO EXPLORER','eyebrow'),node('h2','Counterfactual predictor'),node('p','One event. A shared published baseline.','muted'));
    const close=button('×',closePredictor,'icon-button');close.id='cf-close';close.setAttribute('aria-label','Close counterfactual predictor');head.append(title,close);panel.append(head);
    const body=node('div','','cf-body');body.append(node('p','Explore how an event could change modeled fire activity across the available forecast windows.','cf-intro'));
    const modes=node('div','','cf-modes');for(const mode of ['everyone','expert']){const b=button(mode==='everyone'?'Everyone · presets':'Expert · numbers',()=>setMode(mode),'cf-mode');b.dataset.mode=mode;modes.append(b);}body.append(modes);
    const section=node('section','','cf-section');section.append(node('h3','1 · Choose an event','cf-step-title'));const choices=node('div','','cf-event-grid');
    for(const [type,label] of Object.entries(events)){const b=button(label,()=>{brush?.close();drawing=null;setEvent(defaults(type));},'cf-event-btn');b.dataset.event=type;choices.append(b);}section.append(choices);body.append(section);
    const fields=node('section','','cf-section');fields.id='cf-fields';body.append(fields);
    body.append(node('p','Click the map to place the event. Drag its handles to edit its shape.','cf-hint'),button('Draw event on map',startBrush));
    const run=button('Run comparison',()=>execute().catch(e=>message(e.message,'error')),'cf-run');run.id='cf-run';body.append(run);
    status=node('p','','cf-status');status.id='cf-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');body.append(status);
    const method=node('details','','cf-section');method.append(node('summary','Method & parameters'));
    method.append(node('p','Rule-based scenario estimate on published occupancy scores. Wind, rain, lightning and fuel rules use the published score as a receptivity proxy. Response magnitudes await calibration.','cf-hint'),node('p','Rain follows fuel wetting and recovery. Lightning adds a separate delayed ignition source. Treatment mixes treated and untreated areas; its strength fades with age. Hurricane wind radii follow Radii-CLIPER. Public track winds weaken near land; wider shadows indicate stronger point winds. Expert mode accepts an optional landfall time.','cf-hint'));
    const transfer=node('div','','cf-transfer'),exp=button('Export event',()=>{const blob=new Blob([JSON.stringify({version:1,event:state.event},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download='fire-eye-counterfactual.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    const imp=node('input');imp.type='file';imp.accept='.json,application/json';imp.id='cf-import';imp.onchange=async()=>{try{const file=imp.files[0];if(!file)return;if(file.size>100000)throw Error('Use an event JSON smaller than 100 kB.');const data=JSON.parse(await file.text());setEvent(data.event||data);message('Event imported. Run to compare.');}catch(e){message(e.message,'error');}finally{imp.value='';}};
    const label=node('label','Import event JSON','cf-hint');label.append(imp);transfer.append(exp,label);method.append(transfer);body.append(method);panel.append(body);
    output=node('section','','cf-results');output.id='cf-results';output.hidden=true;output.setAttribute('aria-live','polite');panel.append(output);document.body.append(panel);
  }
  function numeric(box,label,key,min,max,step=1,factor=1) {
    const wrap=node('label','','cf-field');wrap.append(node('span',label));const input=node('input');input.type='number';input.min=min;input.max=max;input.step=step;input.value=state.event[key]*factor;input.id='cf-'+key;input.onchange=()=>{const value=Number(input.value)/factor,patch={[key]:value};if(key==='rainIn'&&state.event.type==='thunderstorm')patch.dry=value<.1;change(patch);};wrap.append(input);box.append(wrap);
  }
  function windWidthControl(box,e){
    const wrap=node('label','','cf-field cf-width-control'),input=node('input'),value=node('output',(e.radiusKm*2).toFixed(0)+' km');
    input.type='range';input.min=20;input.max=200;input.step=10;input.value=e.radiusKm*2;input.id='cf-radiusKm';
    input.oninput=()=>{state.event=normalized({...state.event,radiusKm:Number(input.value)/2});value.textContent=input.value+' km';invalidate();geometry();};
    input.onwheel=ev=>{ev.preventDefault();input.value=Math.max(20,Math.min(200,Number(input.value)+(ev.deltaY<0?10:-10)));input.oninput();};
    wrap.append(node('span','Corridor width · km'),input,value);box.append(wrap);
  }
  function controls() {
    if(!state.open)return;const e=state.event,box=$('cf-fields');box.replaceChildren(node('h3','2 · Set conditions','cf-step-title'));
    document.querySelectorAll('.cf-mode').forEach(b=>{const on=b.dataset.mode===state.mode;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);});
    document.querySelectorAll('.cf-event-btn').forEach(b=>{const on=b.dataset.event===e.type;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);});
    box.append(node('p',`${e.center[1].toFixed(3)}°, ${e.center[0].toFixed(3)}°`,'cf-hint'));
    if(state.mode==='everyone') {
      const group=node('div','','cf-presets');for(const [label,drivers] of presets[e.type]){const on=FirePresets.matches(e,[label,drivers]);const b=button(label,()=>{change(FirePresets.apply(e,[label,drivers],coast||undefined));},'cf-preset');b.setAttribute('aria-pressed',on);b.dataset.preset=label;const detail=Object.entries(drivers).filter(([k])=>k!=='vmax').map(([k,v])=>k==='windMph'?v+' mph':k==='rainIn'?v+' in':k==='coverage'?Math.round(v*100)+'% coverage':k==='ageYears'?v+' years':k==='treatedFraction'?Math.round(v*100)+'% treated':v?'dry':'wet').join(' · ');b.append(node('small',detail));group.append(b);}box.append(group);
    }
    const fields=node('div','','cf-expert-fields');
    if(state.mode==='everyone'&&e.type==='high_wind')windWidthControl(fields,e);
    if(state.mode==='expert') {
      numeric(fields,'Start · h from issue','startH',0,120);numeric(fields,'Duration · h','durationH',1,120);
      if(e.type==='high_wind')numeric(fields,'Corridor width · km','radiusKm',20,200,10,2);
      if(['high_wind','hurricane'].includes(e.type)){numeric(fields,'Sustained wind · mph','windMph',0,250,.1);numeric(fields,'Wind from · °','windFromDeg',0,360,1);}
      if(['heavy_rain','thunderstorm','hurricane'].includes(e.type))numeric(fields,'Total rain · in','rainIn',0,50,.2);
      if(['thunderstorm','hurricane'].includes(e.type))numeric(fields,'Lightning coverage · %','coverage',0,100,1,100);
      if(e.type==='prescribed_burn'){numeric(fields,'Treated fraction · %','treatedFraction',0,100,1,100);numeric(fields,'Years since treatment','ageYears',0,100,.1);}
    }
    box.append(fields);
    if(e.type==='hurricane'&&state.mode==='expert') {
      const track=node('details','','cf-track-editor');track.open=state.mode==='expert';track.append(node('summary','Track · 12-hour positions · wind in kt'));
      const table=node('table'),header=node('tr');for(const name of ['Point','Lon','Lat','Vmax',''])header.append(node('th',name));table.append(header);
      e.track.forEach((p,i)=>{const row=node('tr');row.append(node('th',String(i+1)));p.forEach((v,k)=>{const td=node('td'),inp=node('input');inp.type='number';inp.step=k===2?1:.01;inp.value=k===2?Number(v.toFixed(1)):v;inp.setAttribute('aria-label',`Track point ${i+1} ${['longitude','latitude','wind'][k]}`);inp.onchange=()=>{const t=e.track.map(p=>[...p]);t[i][k]=Number(inp.value);change({track:t});};td.append(inp);row.append(td);});const td=node('td'),remove=button('×',()=>change({track:e.track.filter((_,j)=>j!==i)}),'cf-remove');remove.disabled=e.track.length<=2;remove.setAttribute('aria-label','Remove track point '+(i+1));td.append(remove);row.append(td);table.append(row);});track.append(table,button('Add track point',()=>{const a=e.track.at(-2),b=e.track.at(-1);change({track:[...e.track,[2*b[0]-a[0],2*b[1]-a[1],b[2]]]});}));
      if(state.mode==='expert'){const land=node('label','','cf-field');land.append(node('span','Landfall · h from issue (optional)'));const inp=node('input');inp.type='number';inp.min=0;inp.max=120;inp.value=e.landfallHours??'';inp.onchange=()=>change({landfallHours:inp.value===''?undefined:Number(inp.value)});land.append(inp);track.append(land);}box.append(track);
    }
    if(e.type==='hurricane'){
      const legend=node('div','','cf-intensity-legend');for(const kt of [25,40,55,70,90,110]){const info=FireWeatherSymbols.intensity(kt),item=node('span',info.label);item.style.setProperty('--storm-color',info.color);legend.append(item);}box.append(legend,node('p','CMA intensity colours · wind in kt in the editor','cf-hint'));
    }

  }
  const move=(p,b,d)=>{const lat=d/110.57*Math.cos(b*Math.PI/180),lon=d/(111.32*Math.cos(p[1]*Math.PI/180))*Math.sin(b*Math.PI/180);return[p[0]+lon,p[1]+lat];};
  function shadow(e) {
    const points=[];for(let i=0;i<e.track.length-1;i++)for(let k=0;k<8;k++){const a=e.track[i],b=e.track[i+1],t=k/8;points.push(a.map((v,j)=>v+(b[j]-v)*t));}points.push(e.track.at(-1));
    const radii=points.map(p=>FirePresets.shadowRadius(p[2])),parts=points.map((p,i)=>[model.ring(p.slice(0,2),radii[i],24)]);
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],bearing=Math.atan2((b[0]-a[0])*Math.cos(a[1]*Math.PI/180),b[1]-a[1])*180/Math.PI,ring=[move(a,bearing+90,radii[i-1]),move(b,bearing+90,radii[i]),move(b,bearing-90,radii[i]),move(a,bearing-90,radii[i-1])];ring.push(ring[0]);parts.push([ring]);}
    return {type:'MultiPolygon',coordinates:polygonClipping.union(...parts)};
  }
  function startBrush(){
    if(!state.open)return;brush?.close();
    brush=new FireBrush({map:S().map,onStatus:text=>message(text),onConfirm:result=>{
      if(result.kind==='area'){
        const b=result.area.bounds;change({area:result.area,center:[(b[0]+b[2])/2,(b[1]+b[3])/2]});
      } else {
        const path=result.guide,center=path[Math.floor(path.length/2)],patch={center};
        if(state.event.type==='hurricane'){
          const points=path.map(p=>{const q=S().map.project(p);return[q.x,q.y];});
          patch.track=FireDrawing.sample(points,6).map((p,i)=>{const q=S().map.unproject(p);return[q.lng,q.lat,state.event.track[Math.min(i,state.event.track.length-1)][2]];});patch.center=patch.track[0].slice(0,2);
        }else{patch.windPath=path;const a=path[0],b=path.at(-1);patch.windFromDeg=(Math.atan2((b[0]-a[0])*Math.cos(center[1]*Math.PI/180),b[1]-a[1])*180/Math.PI+540)%360;}
        change(patch);
      }
      message('Drawing confirmed. Run to calculate the comparison.');
    }});
    brush.open(['hurricane','high_wind'].includes(state.event.type)?'path':'area');
  }
  function updateIcons(e){
    const points=e.type==='hurricane'?e.track:[];
    while(icons.length>points.length)icons.pop().remove();
    points.forEach((p,i)=>{
      if(!icons[i]){const element=node('div','','cf-cyclone-marker');element.innerHTML=FireWeatherSymbols.cycloneSvg('currentColor');element.style.pointerEvents='none';icons[i]=new maplibregl.Marker({element,anchor:'center'}).setLngLat(p.slice(0,2)).addTo(S().map);}
      const info=FireWeatherSymbols.intensity(p[2]);icons[i].getElement().style.color=info.color;icons[i].getElement().title=info.label+' · '+p[2]+' kt';icons[i].setLngLat(p.slice(0,2));
    });
  }
  function areaTexture(e){
    const a=e.area,mask=Uint8Array.from(a.mask),inside=FireDrawing.distanceField(mask,a.width,a.height),outside=FireDrawing.distanceField(Uint8Array.from(mask,v=>v?0:1),a.width,a.height,false),max=Math.max(1,...inside),intensity=FireDrawing.shadeIntensity(e),canvas=document.createElement('canvas');canvas.width=a.width;canvas.height=a.height;const ctx=canvas.getContext('2d'),image=ctx.createImageData(a.width,a.height);
    for(let i=0;i<mask.length;i++){
      const strength=mask[i]?.25+.75*inside[i]/max:Math.max(0,1-outside[i]/Math.max(3,max*.3))*.16;
      if(strength)image.data.set(FireArea.pixel(e.type,strength,intensity,!!mask[i]),i*4);
    }
    ctx.putImageData(image,0,0);const b=a.bounds;return {url:canvas.toDataURL(),coordinates:[[b[0],b[3]],[b[2],b[3]],[b[2],b[1]],[b[0],b[1]]]};
  }
  function geometry() {
    if(!state.open)return;const map=S().map,e=state.event,f=[];updateIcons(e);windArrows=[];
    if(e.type==='hurricane')f.push(feature(shadow(e),'shadow'),line(e.track.map(p=>p.slice(0,2)),'track'));
    if(e.type==='high_wind'){
      const guide=e.windPath||[move(e.center,e.windFromDeg,150),move(e.center,(e.windFromDeg+180)%360,150)];
      const screen=guide.map(p=>{const q=map.project(p);return[q.x,q.y];}),anchor=guide[Math.floor(guide.length/2)],width=Math.max(2,Math.abs(map.project(move(anchor,90,e.radiusKm)).x-map.project(anchor).x)*2);
      windArrows=FireDrawing.windField(screen,width,undefined,e.windMph,[0,0,map.getContainer().clientWidth,map.getContainer().clientHeight]).map(a=>({from:map.unproject(a.from).toArray(),to:map.unproject(a.to).toArray(),phase:a.phase,contributors:a.contributors,vector:a.vector}));
    }
    if(e.area){areaImage=areaTexture(e);if(map.getSource('cf-area'))map.getSource('cf-area').updateImage(areaImage);else{map.addSource('cf-area',{type:'image',...areaImage});map.addLayer({id:'cf-area-fill',type:'raster',source:'cf-area',paint:{'raster-opacity':1,'raster-fade-duration':0,'raster-resampling':'linear'}},'cf-event-line');}map.setLayoutProperty('cf-area-fill','visibility','visible');
    }else if(map.getLayer('cf-area-fill'))map.setLayoutProperty('cf-area-fill','visibility','none');
    updateStormSymbols(e);
    const handles=e.type==='hurricane'?e.track:e.area?[e.center]:e.polygon||[e.center];handles.forEach((p,index)=>f.push(feature({type:'Point',coordinates:p.slice(0,2)},'handle',{index})));
    map.getSource('cf-event').setData(fc(f));paint();
  }
  function installLayers(){const map=S().map;map.addSource('cf-event',{type:'geojson',data:fc([])});map.addSource('cf-result',{type:'geojson',data:fc([])});
    map.addLayer({id:'cf-result-fill',type:'fill',source:'cf-result',paint:{'fill-color':'#194d3f','fill-opacity':.9,'fill-antialias':false}});
    map.addLayer({id:'cf-event-fill',type:'fill',source:'cf-event',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#78629f','fill-opacity':.12}});
    map.addLayer({id:'cf-event-line',type:'line',source:'cf-event',filter:['!=',['get','kind'],'handle'],paint:{'line-color':['match',['get','kind'],'lightning','#a67500','wind-guide','#426c62','#78629f'],'line-width':1.8}});
    map.addLayer({id:'cf-event-handles',type:'circle',source:'cf-event',filter:['==',['get','kind'],'handle'],paint:{'circle-color':'#ffffff','circle-radius':7,'circle-opacity':.25,'circle-stroke-width':1,'circle-stroke-color':'#194d3f'}});
  }
  function updateStormSymbols(e){
    stormSymbols.forEach(s=>s.marker.remove());stormSymbols=[];
    if(e.type!=='thunderstorm'||!e.area||e.coverage<=0)return;
    const map=S().map,layout=FireDrawing.stormGrid(e.area,p=>{const q=map.project(p);return[q.x,q.y];},p=>map.unproject(p).toArray(),p=>model.areaAt(e.area,p)>0),drops=FireWeatherSymbols.precipDrops(e.rainIn);
    const add=(kind,position,svg,corners=0)=>{const element=node('div','','cf-weather-marker cf-'+kind+'-marker');element.innerHTML=svg;element.style.pointerEvents='none';element.dataset.corners=corners;element.dataset.drops=kind==='rain'?drops:0;element.setAttribute('aria-label',kind==='rain'?drops+' rain drops':'Lightning');const marker=new maplibregl.Marker({element,anchor:'center'}).setLngLat(position).addTo(map);stormSymbols.push({marker,position:[...position],kind,corners,drops:kind==='rain'?drops:0});};
    for(const cell of layout.lightning)add('lightning',cell.position,FireWeatherSymbols.lightningSvg('currentColor'));
    if(drops)for(const cell of layout.rain)add('rain',cell.position,FireWeatherSymbols.rainSvg(drops,'currentColor'),cell.cornerCount);
  }
  function positionStormSymbols(translate=p=>p,opacity=1){for(const symbol of stormSymbols){symbol.marker.setLngLat(translate(symbol.position));symbol.marker.getElement().style.opacity=opacity;}}
  function animate(time){
    if(!state.open)return;const map=S().map,canvas=$('cf-wind-animation');if(canvas){const dpr=Math.min(devicePixelRatio,2),rect=map.getContainer().getBoundingClientRect();if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      ctx.strokeStyle='#254f43';ctx.lineWidth=1.8;ctx.lineCap='round';
      for(const arrow of windArrows){
        const frame=reduced?{visible:true,start:0,end:1,head:true}:FireDrawing.windFrame(time,arrow.phase);if(!frame.visible)continue;
        const p=map.project(arrow.from),q=map.project(arrow.to),dx=q.x-p.x,dy=q.y-p.y,x=p.x+dx*frame.end,y=p.y+dy*frame.end,angle=Math.atan2(dy,dx),head=Math.min(7,Math.hypot(dx,dy)*.3,Math.hypot(dx,dy)*frame.end);
        ctx.beginPath();ctx.moveTo(p.x+dx*frame.start,p.y+dy*frame.start);ctx.lineTo(x,y);
        if(frame.head){ctx.lineTo(x-head*Math.cos(angle-.45),y-head*Math.sin(angle-.45));ctx.moveTo(x,y);ctx.lineTo(x-head*Math.cos(angle+.45),y-head*Math.sin(angle+.45));}ctx.stroke();
      }
    }animation=requestAnimationFrame(animate);
  }
  function paint() {
    if(!state.open)return;const map=S().map;
    if(state.view==='baseline'||!state.result)S().setRiskDisplay(saved.opacity,saved.visible);
    else S().setRiskDisplay(saved.opacity,state.view!=='change');
    const showArea=!state.result||state.view==='baseline';
    for(const layer of ['cf-area-fill','cf-area-next-fill'])if(map.getLayer(layer))map.setLayoutProperty(layer,'visibility',showArea&&state.event.area?'visible':'none');
    for(const symbol of stormSymbols)symbol.marker.getElement().style.visibility=showArea?'visible':'hidden';
    if(!map.getLayer('cf-result-fill'))return;
    map.setLayoutProperty('cf-result-fill','visibility',state.result&&state.view!=='baseline'?'visible':'none');
    const span=Math.max(.00001,state.result?.span||0);
    map.setPaintProperty('cf-result-fill','fill-color',state.view==='scenario'?['interpolate',['linear'],['get','scenario'],0,'#25572b',.03,'#25572b',.05,'#2f7136',.08,'#6f9641',.15,'#b7bb3e',.25,'#e0b433',.4,'#dd702d',.6,'#a92f2b',1,'#a92f2b']:['interpolate',['linear'],['get','delta'],-span,'#246aa5',0,'#f7f7f1',span,'#a82637']);
  }
  function drawResult(){if(!state.result||!state.open)return;const w=state.result.windows[state.windowIndex],key=w.leadHours;if(key!==geoKey){features=[];const project=proj4(grid.proj4,'EPSG:4326'),t=grid.transform;
      for(let i=0;i<w.delta.length;i++){if(!Number.isFinite(w.delta[i])||w.delta[i]===0)continue;const row=Math.floor(i/grid.width),col=i%grid.width;const ring=[[col,row],[col+1,row],[col+1,row+1],[col,row+1],[col,row]].map(([x,y])=>project.forward([t[0]*x+t[1]*y+t[2],t[3]*x+t[4]*y+t[5]]));features.push(feature({type:'Polygon',coordinates:[ring]},'cell',{baseline:w.baseline[i],scenario:w.scenario[i],delta:w.delta[i]}));}
      geoKey=key;S().map.getSource('cf-result').setData(fc(features));}paint();}
  function renderResult(){if(!state.result)return;output.hidden=false;output.replaceChildren(node('h3','3 · Compare outcomes'));
    const views=node('div','','cf-viewbar');for(const [key,label] of [['baseline','Baseline'],['scenario','Scenario'],['change','Change']]){const b=button(label,()=>setView(key),'cf-view');b.classList.toggle('selected',state.view===key);b.setAttribute('aria-pressed',state.view===key);views.append(b);}output.append(views);
    const legend=node('div','','cf-legend');legend.append(node('p',state.view==='change'?'Change · blue lower / red higher':'Modeled occupancy score'));legend.append(node('div','','cf-legend-bar '+(state.view==='change'?'change':'seq')));const ticks=node('div','','cf-legend-ticks');for(const v of state.view==='change'?[-state.result.span,0,state.result.span]:['Lower','Higher'])ticks.append(node('span',typeof v==='number'?signed(v):v));legend.append(ticks);output.append(legend);
    const stats=node('div','','cf-stats');state.result.windows.forEach((w,i)=>{const b=button(' ',()=>setWindow(i),'cf-stat');b.setAttribute('aria-pressed',i===state.windowIndex);b.append(node('span','+'+w.leadHours+'h','cf-stat-lead'),node('strong',score(w.summary.scenario),'cf-stat-value'),node('span',signed(w.summary.delta)+' score','cf-stat-sub'));stats.append(b);});output.append(stats);
    const w=state.result.windows[state.windowIndex],s=w.summary;output.append(node('p',`${date(w.targetTime)} · ${s.cells.toLocaleString()} native cells · ${Math.round(s.areaKm2).toLocaleString()} km²`,'cf-result-note'),node('p',`Baseline ${score(s.baseline)} → Scenario ${score(s.scenario)} · ${s.baseline?signed(s.relative*100)+'% relative change':'relative change unavailable'}`,'cf-result-note'));
    const chart=node('div','','cf-chart'),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 300 110');svg.setAttribute('role','img');svg.setAttribute('aria-label','Baseline and scenario score over available forecast windows');
    const max=Math.max(.001,...state.result.windows.flatMap(w=>[w.summary.baseline,w.summary.scenario]))*1.1;
    for(const key of ['baseline','scenario']){const path=document.createElementNS(ns,'path');path.setAttribute('class',key);path.setAttribute('d',state.result.windows.map((w,i)=>(i?'L':'M')+(15+i*270/Math.max(1,state.result.windows.length-1))+','+(85-w.summary[key]/max*75)).join(' '));svg.append(path);}state.result.windows.forEach((w,i)=>{const t=document.createElementNS(ns,'text');t.setAttribute('x',15+i*270/Math.max(1,state.result.windows.length-1));t.setAttribute('y',104);t.setAttribute('text-anchor','middle');t.setAttribute('class','tick');t.textContent='+'+w.leadHours+'h';svg.append(t);});chart.append(svg);output.append(node('p','Baseline — · Scenario ━','cf-hint'),chart);
    const readout=node('p','Hover over a changed cell to inspect its scores.','cf-cell-readout');readout.id='cf-cell-readout';output.append(readout,node('p','Rule-based scenario estimate · Published baseline · Parameters pending calibration','cf-result-note'));
  }
  async function execute(){if(!state.open)throw Error('Open the predictor first.');const m=S().manifest,e=normalized(state.event),id=++token;state.result=null;output.hidden=true;S().map.getSource('cf-result').setData(fc([]));$('cf-run').disabled=true;message('Loading verified published grids…');
    try{const windows=[],requested=m.runs.filter(r=>r.overview);let descriptor;
      for(const r of requested){const loaded=await S().gridFor(m,r);if(id!==token||!state.open)return null;if(!loaded)throw Error('Numeric data is unavailable for this window.');if(descriptor&&JSON.stringify(descriptor)!==JSON.stringify(loaded.grid))throw Error('These forecast windows use different grids.');descriptor=loaded.grid;const values=new Float32Array(descriptor.width*descriptor.height);for(let i=0;i<values.length;i++){const raw=loaded.view.getUint16(i*2,true);if(raw!==descriptor.nodata&&raw>1000)throw Error('The published grid contains an invalid score.');values[i]=raw===descriptor.nodata?NaN:raw*descriptor.scale;}windows.push({leadHours:r.lead_hours,targetTime:r.target_time_utc,values});}
      if(!windows.length)throw Error('This release has no numeric grid.');message('Calculating event response…');await new Promise(resolve=>setTimeout(resolve,30));if(id!==token||!state.open||S().manifest!==m)return null;
      const pr=proj4(descriptor.proj4,'EPSG:4326'),result=model.run({grid:descriptor,windows,event:e,project:(x,y)=>pr.forward([x,y])});
      if(id!==token||!state.open||S().manifest!==m)return null;if(!result.footprint.cells)throw Error('Move the event into published forecast coverage.');
      grid=descriptor;state.result=result;state.release=m.release_id;geoKey='';let index=result.windows.findIndex(w=>w.leadHours===S().active.run.lead_hours);if(index<0||result.windows[index].summary.delta===0)index=result.windows.reduce((best,w,i)=>Math.abs(w.summary.delta)>Math.abs(result.windows[best].summary.delta)?i:best,0);state.windowIndex=index;state.view='change';await S().select(result.windows[index].leadHours);if(id!==token||!state.open)return null;renderResult();drawResult();panel.scrollTop=output.offsetTop-90;message(result.span?'Comparison ready · '+date(m.issue_time_utc)+' issue':'No change within available windows. Adjust timing or conditions.','success');return result;
    }catch(e){if(id===token){state.result=null;output.hidden=true;paint();message(e.message,'error');}return null;}finally{if(id===token&&$('cf-run'))$('cf-run').disabled=false;}
  }
  function frameEvent(){
    const e=state.event;if(!e||!state.open)return;
    const pts=e.track?e.track.map(p=>p.slice(0,2)):e.polygon||[move(e.center,225,e.radiusKm*1.5),move(e.center,45,e.radiusKm*1.5)];
    const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),mobile=innerWidth<=640;
    S().map.fitBounds([[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)]],{padding:mobile?{top:Math.round(innerHeight*.65),bottom:35,left:25,right:25}:{top:100,bottom:60,left:700,right:80},maxZoom:5.5,duration:0});
  }
  function setMode(mode){if(!['everyone','expert'].includes(mode))return;state.mode=mode;if(mode==='everyone'&&state.event)setEvent(state.event);else controls();}
  function setView(view){if(!['baseline','scenario','change'].includes(view))return;state.view=view;if(state.result){renderResult();drawResult();}else paint();}
  async function setWindow(i){if(!state.result)return;state.windowIndex=Math.max(0,Math.min(state.result.windows.length-1,i));await S().select(state.result.windows[state.windowIndex].leadHours);if(state.open&&state.result){renderResult();drawResult();}}
  function forecastChanged(){if(!state.open)return;if(state.result&&state.release===S().manifest.release_id){const i=state.result.windows.findIndex(w=>w.leadHours===S().active.run.lead_hours);if(i>=0){state.windowIndex=i;renderResult();drawResult();return;}}invalidate('Published forecast changed. Run to update the comparison.');}
  function click(e){if(brush?.active)return;if(!state.open)return saved.click?.(e);if(suppressClick){suppressClick=false;return;}const p=[e.lngLat.lng,e.lngLat.lat];
    if(drawing){drawing.push(p);geometry();controls();return;}
    if(features.length){const cell=S().map.queryRenderedFeatures(e.point,{layers:['cf-result-fill']})[0];if(cell){inspect(cell);return;}}
    const dx=p[0]-state.event.center[0],dy=p[1]-state.event.center[1],patch={center:p};if(state.event.area){const b=state.event.area.bounds;patch.area={...state.event.area,bounds:[b[0]+dx,b[1]+dy,b[2]+dx,b[3]+dy]};}if(state.event.windPath)patch.windPath=state.event.windPath.map(q=>[q[0]+dx,q[1]+dy]);if(state.event.track)patch.track=state.event.track.map(q=>[q[0]+dx,q[1]+dy,q[2]]);if(state.event.polygon)patch.polygon=state.event.polygon.map(q=>[q[0]+dx,q[1]+dy]);change(patch);
  }
  function inspect(cell){const out=$('cf-cell-readout');if(out){const p=cell.properties;out.textContent=`Baseline ${score(Number(p.baseline))} · Scenario ${score(Number(p.scenario))} · Change ${signed(Number(p.delta))}`;}}
  function down(e){
    if(brush?.active)return;const map=S().map,point=e.point||e.points?.[0];if(!point)return;
    const handle=map.queryRenderedFeatures(point,{layers:['cf-event-handles']})[0],shape=map.queryRenderedFeatures(point,{layers:['cf-event-fill','cf-event-line']})[0];
    if(handle)drag={index:Number(handle.properties.index)};
    else if(shape&&state.event.type==='hurricane')drag={whole:true,start:[e.lngLat.lng,e.lngLat.lat],event:structuredClone(state.event)};
    else return;map.dragPan.disable();e.preventDefault();
  }
  function moveHandle(e){if(brush?.active)return;if(drag!==null){const p=[e.lngLat.lng,e.lngLat.lat],next=structuredClone(drag.whole?drag.event:state.event);if(drag.whole){const dx=p[0]-drag.start[0],dy=p[1]-drag.start[1];next.track=next.track.map(q=>[q[0]+dx,q[1]+dy,q[2]]);next.center=[next.center[0]+dx,next.center[1]+dy];}
      else if(next.track){next.track[drag.index]=[...p,next.track[drag.index][2]];if(drag.index===0)next.center=[...p];}
      else{const dx=p[0]-next.center[0],dy=p[1]-next.center[1];next.center=p;if(next.area){const b=next.area.bounds;next.area.bounds=[b[0]+dx,b[1]+dy,b[2]+dx,b[3]+dy];}if(next.windPath)next.windPath=next.windPath.map(q=>[q[0]+dx,q[1]+dy]);}
      try{state.event=normalized(publicEvent(next));invalidate('Event moved. Run to update.');geometry();}catch{}return;
    }if(state.result&&state.view!=='baseline'){const cell=S().map.queryRenderedFeatures(e.point,{layers:['cf-result-fill']})[0];if(cell)inspect(cell);}
  }
  function up(){if(drag!==null){drag=null;suppressClick=true;setTimeout(()=>suppressClick=false,200);if(saved.pan)S().map.dragPan.enable();controls();}}
  function key(e){if(e.key==='Escape'){if(brush?.active){brush.close();return;}if(drawing){drawing=null;geometry();controls();}else closePredictor();}}
  async function open(){if(state.open)return true;if(!S()?.ready){$('counterfactual-open').textContent='Forecast loading · retry shortly';return false;}const s=S(),map=s.map,previous={opacity:s.riskOpacity,visible:s.riskVisible,click:s.onMapClick,inspection:!$('inspection').hidden,selected:s.selected,pan:map.dragPan.isEnabled(),padding:map.getPadding()};await loadCoast();if(state.open)return true;build();window.fireEyeCore?.resetDownload?.();state.event||=defaults('high_wind',s.selected||[-120,38]);saved=previous;state.open=true;panel.hidden=false;$('inspection').hidden=true;s.onMapClick=click;$('counterfactual-open').setAttribute('aria-expanded','true');document.body.classList.add('counterfactual-active');installLayers();const windCanvas=node('canvas','','cf-wind-animation');windCanvas.id='cf-wind-animation';map.getContainer().append(windCanvas);animation=requestAnimationFrame(animate);map.on('zoomend',geometry);controls();geometry();state.result=null;output.hidden=true;message('Published baseline ready. Choose conditions, then run.');map.on('mousedown',down);map.on('mousemove',moveHandle);map.on('mouseup',up);map.on('touchstart',down);map.on('touchmove',moveHandle);map.on('touchend',up);window.addEventListener('mouseup',up);window.addEventListener('keydown',key);window.addEventListener('fire-eye:forecast-changed',forecastChanged);$('cf-close').focus();return true;}
  function closePredictor(){if(!state.open)return;brush?.close();S().map.off('zoomend',geometry);cancelAnimationFrame(animation);icons.forEach(icon=>icon.remove());icons=[];stormSymbols.forEach(s=>s.marker.remove());stormSymbols=[];$('cf-wind-animation')?.remove();token++;state.open=false;drawing=null;drag=null;state.result=null;output.hidden=true;panel.hidden=true;const s=S(),map=s.map;if(s.onMapClick===click)s.onMapClick=saved.click;s.setRiskDisplay(saved.opacity,saved.visible);if(saved.pan)map.dragPan.enable();else map.dragPan.disable();map.setPadding(saved.padding);s.selected=saved.selected;$('inspection').hidden=!saved.inspection;
    for(const [name,fn] of [['mousedown',down],['mousemove',moveHandle],['mouseup',up],['touchstart',down],['touchmove',moveHandle],['touchend',up]])map.off(name,fn);window.removeEventListener('mouseup',up);window.removeEventListener('keydown',key);window.removeEventListener('fire-eye:forecast-changed',forecastChanged);
    for(const id of ['cf-result-fill','cf-area-fill','cf-event-fill','cf-event-line','cf-event-handles'])if(map.getLayer(id))map.removeLayer(id);for(const id of ['cf-result','cf-area','cf-event'])if(map.getSource(id))map.removeSource(id);document.body.classList.remove('counterfactual-active');$('counterfactual-open').setAttribute('aria-expanded','false');$('counterfactual-open').focus();}
  window.fireEyeCounterfactual={open,close:closePredictor,run:execute,startBrush,setEvent,setMode,setView,setWindow,defaults,normalize:normalized,getState:()=>state,get state(){return state;},get event(){return state.event;},get result(){return state.result;},get visuals(){return {windArrows:windArrows.length,cyclones:icons.length,brushActive:!!brush?.active,lightning:stormSymbols.filter(s=>s.kind==='lightning').length,rain:stormSymbols.filter(s=>s.kind==='rain').map(s=>({corners:s.corners,drops:s.drops})),windVectors:windArrows.map(a=>({from:a.from,to:a.to,phase:a.phase,contributors:a.contributors}))};}};
  $('counterfactual-open').addEventListener('click',open);
})();

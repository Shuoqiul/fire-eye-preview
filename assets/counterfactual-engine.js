'use strict';
/* Native-unit hourly process diagnostics; published model references stay immutable. */
(function (root) {
  const science=typeof module==='object'&&module.exports?require('./counterfactual-methods.js'):root.FireMethods;
  const TYPES = ['hurricane', 'thunderstorm', 'high_wind', 'heavy_rain', 'prescribed_burn'];
  const KM_PER_DEG_LAT = 110.57;
  const KM_PER_DEG_LON = 111.32;
  const NMI_TO_KM = 1.852;
  const LIMITS = {
    radiusKm: [10, 1000],
    startH: [0, 120],
    durationH: [1, 120],
    windMph: [0, 250],
    windFromDeg: [0, 360],
    rainIn: [0, 50],
    coverage: [0, 1],
    treatedFraction: [0, 1],
    ageYears: [0, 100]
  };
  const P = Object.freeze({footprintThreshold:0.001,windEllipseFactor:0.5,initialFFMC:85});
  const METADATA = Object.freeze({
    endpoint:'Initial spread index (ISI)',unit:'ISI',version:'20261117-research',
    evidence:'Published hourly FFMC/ISI mechanisms; source-specific storm fields; conditional discovery fit.',
    rain:'Hourly positive-rain wetting followed by temperature/RH/wind-driven state recovery.',
    hurricaneFields:'Coarse North Atlantic climatological wind preset, one field for wind and radii; NHC R-CLIPER rainfall at 35–150 kt.',
    lightning:'Discovery timing is conditional on an already matched reported fire. Exposure-conditioned ignition requires the corresponding model.',
    burn:'Treatment response uses supplied paired fuel-process outcomes. Treatment type and recovery rules are required.',
    outputs:'Native mechanism diagnostics and immutable raw/published model references have separate endpoints.',
    geometry:'Affine cell centres and spatial support use the native grid and supplied projection.',
    initialization:'FFMC=85 is a conditional initial state; snapshot weather persistence and zero background rain are explicit assumptions.'
  });

  function finite(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }
  function inRange(v, lo, hi) {
    return finite(v) && v >= lo && v <= hi;
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function validPoint(p) {
    return Array.isArray(p) && p.length === 2 && inRange(p[0], -180, 180) && inRange(p[1], -90, 90);
  }
  function numberIn(v, name, range) {
    if (!inRange(v, range[0], range[1])) {
      throw new Error(name + ' must be a number between ' + range[0] + ' and ' + range[1] + '.');
    }
    return v;
  }
  function kmPerLon(lat) {
    return KM_PER_DEG_LON * Math.max(0.1, Math.cos(lat * Math.PI / 180));
  }
  function distance(a, b) {
    if (!validPoint(a) || !validPoint(b)) throw new Error('distance needs valid [lon,lat] points.');
    return Math.hypot(
      (b[0] - a[0]) * kmPerLon((a[1] + b[1]) / 2),
      (b[1] - a[1]) * KM_PER_DEG_LAT
    );
  }
  function smoothstep(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function moveKm(c, bearing, km) {
    const lat1 = c[1] * Math.PI / 180;
    const lon1 = c[0] * Math.PI / 180;
    const d = km / 6371.0088;
    const a = bearing * Math.PI / 180;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(a));
    const lon2 = lon1 + Math.atan2(
      Math.sin(a) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
    return [lon2 * 180 / Math.PI, lat2 * 180 / Math.PI];
  }
  function ring(center, radiusKm, steps) {
    if (!validPoint(center) || !inRange(radiusKm, 0.001, 2000)) {
      throw new Error('Ring needs a valid centre and radius.');
    }
    const n = Number.isInteger(steps) && steps >= 8 ? steps : 72;
    const out = [];
    for (let i = 0; i <= n; i++) out.push(moveKm(center, i / n * 360, radiusKm));
    return out;
  }
  function makePolygon(center) {
    const shape = [[-1, -0.65], [-0.45, -1], [0.45, -1], [1, -0.45], [0.8, 0.2], [0.5, 1], [-0.4, 0.9], [-0.95, 0.3]];
    return shape.map(p => [
      center[0] + p[0] * 75 * 0.8 / kmPerLon(center[1]),
      center[1] + p[1] * 75 / KM_PER_DEG_LAT
    ]);
  }
  function makeTrack(center) {
    const out = [];
    for (let i = 0; i < 6; i++) {
      // Six 12-hour points span 60 hours, matching leadHours from a 12-hour forecast.
      const point = moveKm(center, 45, i * 12 * 12 * NMI_TO_KM);
      out.push([point[0], point[1], 90 - 7 * i]);
    }
    return out;
  }
  function fallback(type, center) {
    if (!TYPES.includes(type)) throw new Error('Choose one of the five supported event types.');
    if (!validPoint(center)) throw new Error('Choose a valid [longitude, latitude] event centre.');
    const n = {
      type,
      center: [center[0], center[1]],
      radiusKm: 250,
      startH: 0,
      durationH: 48,
      windMph: 27,
      windFromDeg: 270,
      rainIn: 0.3,
      coverage: 0.4,
      dry: true,
      treatedFraction: 0.6,
      ageYears: 2,
      track: null,
      polygon: null
    };
    if (type === 'thunderstorm') {
      n.radiusKm = 120;
      n.rainIn = 0.1;
    }
    if (type === 'heavy_rain') {
      n.radiusKm = 200;
      n.rainIn = 0.6;
    }
    if (type === 'high_wind') n.radiusKm = 150;
    if (type === 'hurricane') {
      n.radiusKm = 300;
      n.rainIn = 3;
      n.coverage = 0.3;
      n.track = makeTrack(n.center);
    }
    if (type === 'prescribed_burn') {
      n.radiusKm = 75;
      n.durationH = 12;
      n.track = null;
      n.polygon = makePolygon(n.center);
    }
    return n;
  }
  const mercY=lat=>(1-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/Math.PI)/2;
  function normalizeArea(area){
    const {width:w,height:h,bounds,mask}=area||{};
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<2||h<2||w>192||h>192||!Array.isArray(mask)||mask.length!==w*h||mask.some(v=>v!==0&&v!==1)||!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite)||bounds[0]>=bounds[2]||bounds[1]>=bounds[3]||bounds[0]<-180||bounds[2]>180||bounds[1]<=-85||bounds[3]>=85)throw Error('Area needs a bounded painted mask and geographic bounds.');
    return {width:w,height:h,bounds:[...bounds],mask:[...mask]};
  }
  const areaFields=new WeakMap();
  function areaField(area){
    if(areaFields.has(area))return areaFields.get(area);
    const w=area.width,h=area.height,d=Float32Array.from(area.mask,v=>v?10000:0);
    // Boundary is outside the painted shape; two chamfer passes retain holes.
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!area.mask[i])continue;d[i]=Math.min(d[i],x?d[i-1]+1:1,y?d[i-w]+1:1,x&&y?d[i-w-1]+1.414:10000);}
    for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(area.mask[i])d[i]=Math.min(d[i],x<w-1?d[i+1]+1:1,y<h-1?d[i+w]+1:1,x<w-1&&y<h-1?d[i+w+1]+1.414:10000);}
    const maximum=Math.max(1,...d);for(let i=0;i<d.length;i++)d[i]=area.mask[i]?.15+.85*Math.min(1,d[i]/maximum):0;
    areaFields.set(area,d);return d;
  }
  function areaAt(area,point){
    const b=area.bounds,x=(point[0]-b[0])/(b[2]-b[0])*area.width,y=(mercY(point[1])-mercY(b[3]))/(mercY(b[1])-mercY(b[3]))*area.height;
    return x<0||y<0||x>=area.width||y>=area.height?0:areaField(area)[Math.floor(y)*area.width+Math.floor(x)];
  }
  function normalize(event) {
    if (!event || typeof event !== 'object' || !TYPES.includes(event.type)) {
      throw new Error('Choose one of the five supported event types.');
    }
    if (event.type === 'hurricane' && event.validHours != null &&
      !(Number.isInteger(event.validHours) && event.validHours >= 0 && event.validHours < 10000)) {
      throw new Error('Hurricane validHours must be a non-negative integer.');
    }
    if (!validPoint(event.center)) throw new Error('Event center must be [longitude, latitude].');
    const n = { type: event.type, center: [event.center[0], event.center[1]], track: null, polygon: null };
    for (const key of Object.keys(LIMITS)) n[key] = numberIn(event[key], key, LIMITS[key]);
    if (event.dry != null && typeof event.dry !== 'boolean') throw new Error('dry must be true or false.');
    n.dry = event.dry;
    if(event.area && ['heavy_rain','thunderstorm','prescribed_burn'].includes(event.type)){
      const motion=event.motion||{speed:30};
      if(!Number.isFinite(motion.speed)||motion.speed<0||motion.speed>100)throw Error('Cloud activity must be within 0–100.');
      n.motion={speed:motion.speed};
    }
    if(event.area)n.area=normalizeArea(event.area);
    if(event.windPath){if(!Array.isArray(event.windPath)||event.windPath.length<2||event.windPath.length>128||event.windPath.some(p=>!validPoint(p)))throw Error('Wind path needs valid points.');n.windPath=event.windPath.map(p=>[...p]);}
    if (event.landfallHours != null && !inRange(event.landfallHours, 0, 100000)) {
      throw new Error('landfallHours must be a non-negative number.');
    }
    if (event.landfallHours != null) n.landfallHours = event.landfallHours;
    if (event.type === 'hurricane') {
      if(inRange(event.cyclonePresetKt,0,300))n.cyclonePresetKt=event.cyclonePresetKt;
      if (!Array.isArray(event.track) || (event.track.length < 2 || event.track.length > 64)) {
        throw new Error('Provide at least two valid hurricane track points.');
      }
      n.track = event.track.map(p => {
        if (!Array.isArray(p) || p.length < 3 || !inRange(p[0], -180, 180) ||
          !inRange(p[1], -90, 90) || !inRange(p[2], 0, 300)) {
          throw new Error('Track points require [lon,lat,vmaxKt] within valid bounds.');
        }
        return [p[0], p[1], p[2]];
      });
      if (event.validHours != null) n.validHours = event.validHours;
      if (!finite(event.validHours)) n.validHours = 0;
      if (!finite(event.radiusKm)) n.radiusKm = 300;
    }
    if (event.type === 'prescribed_burn') {
      if (!Array.isArray(event.polygon) || (event.polygon.length < 3 || event.polygon.length > 128)) {
        throw new Error('Provide a burn polygon with at least three points.');
      }
      n.polygon = event.polygon.map(p => {
        if (!validPoint(p)) throw new Error('Burn polygon needs valid [lon,lat] points.');
        return [p[0], p[1]];
      });
      if (n.polygon.length>3 && n.polygon[0].every((v,i)=>v===n.polygon.at(-1)[i])) n.polygon.pop();
      const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      let area=0;
      for(let i=0;i<n.polygon.length;i++) {
        const a=n.polygon[i],b=n.polygon[(i+1)%n.polygon.length];area+=a[0]*b[1]-b[0]*a[1];
        for(let j=i+2;j<n.polygon.length;j++) {
          if(i===0 && j===n.polygon.length-1)continue;
          const c=n.polygon[j],d=n.polygon[(j+1)%n.polygon.length];
          if(cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) throw Error('Use a treatment polygon with no crossing edges.');
        }
      }
      if(Math.abs(area)<1e-10)throw Error('Treatment polygon needs a nonzero area.');
    }
    return n;
  }
  function defaults(type, center) {
    return normalize(fallback(type, center || [-112, 39]));
  }
  function inside(poly, x, y) {
    let yes = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
    }
    return yes;
  }
  function polygonDistance(poly, x, y) {
    let d = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const q = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      d = Math.min(d, Math.hypot(x - a[0] - q * dx, y - a[1] - q * dy));
    }
    return d;
  }
  const radiusCache=new Map();
  function tcRadius(vmax,lat,threshold,theta,speed=12) {
    if(vmax<=0||threshold>vmax)return 0;
    const key=[vmax,lat,threshold,theta,speed].join(':');if(radiusCache.has(key))return radiusCache.get(key);
    const value=science.cycloneRadius(vmax,lat,threshold,theta,speed);if(radiusCache.size>2048)radiusCache.clear();radiusCache.set(key,value);return value;
  }
  function tcWind(vmax,lat,distanceKm,theta,speed=12) {
    return vmax<=0?0:science.cycloneWind(vmax,lat,distanceKm,theta,speed);
  }
  function stormMotion(e,leadHours){
    const index=clamp(Math.floor((leadHours-(e.validHours||0))/12),0,e.track.length-2),a=e.track[index],b=e.track[index+1],mean=(a[1]+b[1])/2;
    return {speed:distance(a.slice(0,2),b.slice(0,2))/12/NMI_TO_KM,bearing:(Math.atan2((b[0]-a[0])*Math.cos(mean*Math.PI/180),b[1]-a[1])*180/Math.PI+360)%360};
  }
  function localHurricaneWind(e,leadHours,point){
    const c=trackCenter(e,leadHours);if(c.offTrack)return 0;
    const motion=stormMotion(e,leadHours),dx=(point[0]-c.lon)*kmPerLon(c.lat),dy=(point[1]-c.lat)*KM_PER_DEG_LAT,bearing=(Math.atan2(dx,dy)*180/Math.PI+360)%360,theta=(motion.bearing+90-bearing+360)%360;
    return tcWind(c.vmax,c.lat,Math.hypot(dx,dy),theta,motion.speed)*1.15078;
  }
  function convectiveFootprint(e,leadHours,point){
    const c=trackCenter(e,leadHours);return c.offTrack?0:Math.exp(-Math.pow(distance([c.lon,c.lat],point)/e.radiusKm,2));
  }
  function quadrantInterp(radii, theta) {
    const th = ((theta % 360) + 360) % 360;
    const i = Math.floor(((th + 45) % 360) / 90) % 4;
    const t = ((th + 45) % 360) % 90 / 90;
    return radii[i] * (1 - t) + radii[(i + 1) % 4] * t;
  }
  function tcEnvelope(vmax, lat, distanceKm, theta, speed = 12) {
    const qr = [45, 135, 225, 315].map(q => tcRadius(vmax, lat, 34, q, speed));
    const r34 = quadrantInterp(qr, theta);
    if (r34 <= 0) return 0;
    const r64 = quadrantInterp([45, 135, 225, 315].map(q => tcRadius(vmax, lat, 64, q, speed)), theta);
    return Math.min(1, outerEnvelope(distanceKm, r34) + (r64 > 0 && distanceKm <= r64 ? 0.25 : 0));
  }
  function tcEnvelopeRadius(vmax, lat, threshold, theta, speed = 12) {
    const radii = [45, 135, 225, 315].map(q => tcRadius(vmax, lat, threshold, q, speed));
    return quadrantInterp(radii, theta);
  }
  function tcEnvelopeGeometry(center, vmax, lat, threshold, bearing, steps, speed) {
    const n = Number.isInteger(steps) && steps >= 4 ? steps : 48;
    const radius = th => tcEnvelopeRadius(vmax, lat, threshold, th, speed);
    const start = (bearing + 90 + 360) % 360;
    const out = [];
    for (let i = 0; i <= n * 4; i++) {
      const th = i / n * 90;
      out.push(moveKm(center, start - th, radius(th)));
    }
    return out;
  }
  function decayedWind(landfallKt, lat, hoursOverLand) {
    const l = Math.min(40, Math.max(36, Math.abs(lat)));
    const f = (l - 36) / 4;
    const alpha = 0.095 + f * (0.183 - 0.095);
    const background = 26.7 + f * (29.6 - 26.7);
    if(landfallKt<=background)return landfallKt;
    const v0 = Math.max(background,0.9 * landfallKt);
    if (hoursOverLand <= 0) return v0;
    return Math.max(background, background + (v0 - background) * Math.exp(-alpha * hoursOverLand));
  }
  function trackCenter(e, leadHours) {
    // Track points are 12-hour positions. validHours places the first point on the
    // forecast clock; leadHours is the published window end.
    if (!finite(leadHours) || leadHours < 0) {
      throw new Error('Hurricane track needs a non-negative leadHours.');
    }
    const stamp = Math.max(0, (leadHours - (e.validHours || 0)) / 12);
    const i = Math.floor(stamp);
    if (i >= e.track.length) {
      return { offTrack: true, lon: NaN, lat: NaN, vmax: NaN };
    }
    const a = e.track[i];
    const b = e.track[Math.min(e.track.length - 1, Math.max(0, i) + 1)];
    const t = i >= e.track.length - 1 ? 0 : clamp(stamp - i, 0, 1);
    const lat = a[1] * (1 - t) + b[1] * t;
    let vmax = a[2] * (1 - t) + b[2] * t;
    if (e.landfallHours != null && leadHours >= e.landfallHours) {
      const at=clamp((e.landfallHours-(e.validHours||0))/12,0,e.track.length-1),k=Math.floor(at),a=e.track[k],b=e.track[Math.min(k+1,e.track.length-1)],fraction=at-k;
      const landWind=a[2]+(b[2]-a[2])*fraction,landLat=a[1]+(b[1]-a[1])*fraction;
      vmax=Math.min(vmax,decayedWind(landWind,landLat,leadHours-e.landfallHours));
    }
    if(vmax<=0)return {offTrack:true,lon:NaN,lat:NaN,vmax:0};
    return {
      lon: a[0] * (1 - t) + b[0] * t,
      lat,
      vmax
    };
  }
  function timeProfile(e,leadHours){return activeHours(e,leadHours)/12;}
  function windDriver(mph,referenceMph=10) {
    return science.windLogRatio(mph*1.609344,referenceMph*1.609344);
  }
  function activeHours(e,leadHours){return Math.max(0,Math.min(leadHours,e.startH+e.durationH)-Math.max(leadHours-12,e.startH));}
  function footprintAt(e, leadHours, point) {
    if(e.area)return areaAt(e.area,point);
    if(e.type==='high_wind'&&e.windPath){
      let nearest=Infinity;const k=kmPerLon(point[1]);
      for(let i=1;i<e.windPath.length;i++){const a=e.windPath[i-1],b=e.windPath[i],ax=(a[0]-point[0])*k,ay=(a[1]-point[1])*KM_PER_DEG_LAT,dx=(b[0]-a[0])*k,dy=(b[1]-a[1])*KM_PER_DEG_LAT,t=clamp(-(ax*dx+ay*dy)/(dx*dx+dy*dy||1),0,1);nearest=Math.min(nearest,Math.hypot(ax+t*dx,ay+t*dy));}
      return Math.exp(-Math.LN2*Math.pow(nearest/e.radiusKm,2));
    }
    if (e.type === 'prescribed_burn') {
      if (!Number.isFinite(leadHours)) return 0;
      if (inside(e.polygon, point[0], point[1])) return 1;
      const d = polygonDistance(e.polygon, point[0], point[1]);
      return d >= 10 / KM_PER_DEG_LAT ? 0 : 0.7 * Math.exp(-Math.pow(d / (5 / KM_PER_DEG_LAT), 2));
    }
    if (e.type === 'hurricane') {
      const c = trackCenter(e, leadHours);
      if (c.offTrack) return 0;
      return Math.max(hurricaneResponse(e,c,point,leadHours),(hasRain(e)||e.coverage>0)?convectiveFootprint(e,leadHours,point):0);
    }
    const c = e.center;
    const dx = (point[0] - c[0]) * kmPerLon(c[1]);
    const dy = (point[1] - c[1]) * KM_PER_DEG_LAT;
    if (e.type === 'high_wind') {
      const b = e.windFromDeg * Math.PI / 180;
      const along = dx * Math.sin(b) + dy * Math.cos(b);
      const across = dx * Math.cos(b) - dy * Math.sin(b);
      return Math.exp(-Math.pow(Math.hypot(along * P.windEllipseFactor, across) / e.radiusKm, 2));
    }
    return Math.exp(-Math.pow(Math.hypot(dx, dy) / e.radiusKm, 2));
  }
  function hurricaneResponse(e, c, point,leadHours) {
    const dx = (point[0] - c.lon) * kmPerLon(c.lat);
    const dy = (point[1] - c.lat) * KM_PER_DEG_LAT;
    const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    const motion=stormMotion(e,leadHours),startBearing=(motion.bearing+90+360)%360;
    const theta = (startBearing - bearing + 360) % 360;
    const d = Math.hypot(dx, dy);
    return c.vmax<34?Math.exp(-Math.pow(d/e.radiusKm,2)):tcEnvelope(c.vmax,c.lat,d,theta,motion.speed);
  }
  function outerEnvelope(d, r34) {
    if (d <= r34) return 1;
    if (d >= r34 * 1.5) return 0;
    return 1 - (d - r34) / (r34 * 0.5);
  }

  function hasRain(e) {
    return !!e && (e.type === 'heavy_rain' || e.type === 'hurricane' || e.type === 'thunderstorm') &&
      e.rainIn > 0;
  }

  function checkInput(input) {
    if (!input || typeof input !== 'object') throw new Error('Provide grid, windows, event and project.');
    const g = input.grid;
    if (!g || !Number.isInteger(g.width) || !Number.isInteger(g.height) || g.width < 1 || g.height < 1) {
      throw new Error('Grid needs integer width and height.');
    }
    if (!Array.isArray(g.transform) || g.transform.length < 6 || !g.transform.slice(0, 6).every(finite)) {
      throw new Error('Grid transform must have six finite values.');
    }
    if (!Array.isArray(input.windows) || !input.windows.length) {
      throw new Error('Provide at least one published forecast window.');
    }
    if (typeof input.project !== 'function') {
      throw new Error('Project must map a native cell centre to [lon,lat].');
    }
    const n = g.width * g.height;
    const windows = input.windows.map((w, i) => {
      if (!w || !Number.isInteger(w.leadHours) || w.leadHours<12 || w.leadHours>240 || w.leadHours%12!==0 || !Number.isFinite(Date.parse(w.targetTime)) ||
        !(w.values instanceof Float32Array) || w.values.length !== n) {
        throw new Error('Window ' + i + ' needs leadHours, targetTime and correctly sized Float32Array values.');
      }
      for (const value of w.values) {
        if (!Number.isNaN(value) && (!finite(value) || value < 0 || value > 1)) {
          throw new Error('Published scores must be NaN or within [0,1].');
        }
      }
      return { leadHours: w.leadHours, targetTime: w.targetTime, values: w.values };
    });
    if(new Set(windows.map(w=>w.leadHours)).size!==windows.length)throw Error('Forecast leads must be unique.');
    if(g.transform[0]*g.transform[4]-g.transform[1]*g.transform[3]===0)throw Error('Grid transform must be invertible.');
    return {
      grid: g,
      windows,
      event: input.event == null ? null : normalize(input.event),
      project: input.project
    };
  }
  function eventRegion(e) {
    if(e.area){const b=e.area.bounds;return {x0:b[0],y0:b[1],x1:b[2],y1:b[3]};}
    const pts = e.type === 'hurricane' ? e.track.map(p => [p[0], p[1]]) :
      e.windPath ? e.windPath : e.type === 'prescribed_burn' ? e.polygon.concat([e.center]) : [e.center];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
    let margin = (e.type === 'high_wind' ? 4*e.radiusKm : 2*e.radiusKm) + 50;
    if (e.type === 'hurricane') {
      const strength = Math.max(...e.track.map(p => p[2]));
      for (const p of e.track) for (const theta of [45, 135, 225, 315]) {
        margin = Math.max(margin, 1.5 * tcRadius(strength, clamp(p[1], -75, 75), 34, theta));
      }
      margin += 50;
    }
    margin /= KM_PER_DEG_LAT;
    const lonMargin = margin / Math.max(0.2, Math.cos(clamp((y0 + y1) / 2, -75, 75) * Math.PI / 180));
    return { x0: x0 - lonMargin, x1: x1 + lonMargin, y0: y0 - margin, y1: y1 + margin };
  }
  function affineCenter(grid, x, y) {
    // GDAL affine order: a,b,c,d,e,f => x' = ax + by + c, y' = dx + ey + f.
    // x,y are native pixel indices. Cell centres are x + 0.5, y + 0.5.
    const t = grid.transform;
    return [t[0] * x + t[1] * y + t[2], t[3] * x + t[4] * y + t[5]];
  }
  function run(input) {
    const {grid:g, windows:wins, event:e, project} = checkInput(input);
    if(input.context?.issueTimeUtc){for(const w of wins)if(Date.parse(w.targetTime)-Date.parse(input.context.issueTimeUtc)!==w.leadHours*3600000||w.leadHours!==input.context.leadHours)throw Error('Research sample and prediction window must share the same forecast clock.');const cg=input.context.grid;if(cg&&(cg.width!==g.width||cg.height!==g.height||JSON.stringify(cg.transform)!==JSON.stringify(g.transform)))throw Error('Research weather and prediction must share the native grid.');}
    const n=g.width*g.height, area=Math.abs(g.transform[0]*g.transform[4]-g.transform[1]*g.transform[3])/1e6;
    const out=wins.map(w=>({leadHours:w.leadHours,targetTime:w.targetTime,publishedBaseline:new Float32Array(w.values),baseline:e?new Float32Array(n).fill(NaN):new Float32Array(w.values),scenario:e?new Float32Array(n).fill(NaN):new Float32Array(w.values),delta:e?new Float32Array(n).fill(NaN):Float32Array.from(w.values,v=>Number.isNaN(v)?NaN:0),summary:{}}));
    const selected=[];
    if (!e) {
      for(let i=0;i<n;i++) if(wins.some(w=>Number.isFinite(w.values[i]))) selected.push({i});
    } else {
      const region=eventRegion(e);
      for(let row=0;row<g.height;row++) for(let col=0;col<g.width;col++) {
        const i=row*g.width+col;
        if(!wins.some(w=>Number.isFinite(w.values[i]))) continue;
        const xy=affineCenter(g,col+.5,row+.5), p=project(xy[0],xy[1]);
        if(!validPoint(p)) throw Error('Project must return valid [lon,lat] points.');
        if(!pointInRegion(p[0],p[1],region)) continue;
        let f=0;
        if(e.type!=='hurricane')f=footprintAt(e,0,p);else for(let h=0;h<=Math.max(...wins.map(w=>w.leadHours));h++)f=Math.max(f,footprintAt(e,h,p));
        if(e.area?f>0:f>=P.footprintThreshold) selected.push({i,p});
      }
    }
    const maxLead=Math.max(...wins.map(w=>w.leadHours));
    const context=input.context||null,weatherAt=input.weatherAt||context?.weatherAt||(()=>({tempC:25,rhPct:30,uMs:10/3.6,vMs:0,rainMm:0,initialFFMC:85}));
    const available=!e||e.type!=='prescribed_burn';
    const forcing=context?'snapshot-held':'reference-weather';
    let rainDomainHours=0;
    if(e&&available)for(const cell of selected) {
      const first=weatherAt(cell.i,0);if(!first)continue;
      let baseFFMC=first.initialFFMC??85,scenarioFFMC=baseFFMC,totalRain=0;
      const target=e.type==='high_wind'?windTarget(e,cell.p):null;
      for(let h=1;h<=maxLead;h++) {
        const weather=weatherAt(cell.i,h);if(!weather)break;
        const {tempC,rhPct,uMs,vMs}=weather;
        if(![tempC,rhPct,uMs,vMs].every(finite)||rhPct<0||rhPct>100)throw Error('Hourly weather needs finite °C, RH %, and east/north m/s.');
        const backgroundRain=weather.rainMm??0;if(!finite(backgroundRain)||backgroundRain<0)throw Error('Hourly background rain must be nonnegative mm.');
        const active=Math.max(0,Math.min(h,e.startH+e.durationH)-Math.max(h-1,e.startH));
        const weight=footprintAt(e,h-.5,cell.p),blend=clamp(weight*active,0,1);
        let u=uMs,v=vMs,rain=backgroundRain;
        if(e.type==='high_wind'){
          const speed=e.windMph*.44704;[u,v]=science.blendWindVectors(uMs,vMs,speed*target[0],speed*target[1],blend);
        }else if(e.type==='hurricane'&&active>0){
          const center=trackCenter(e,h-.5);
          if(!center.offTrack){
            const dx=(cell.p[0]-center.lon)*kmPerLon(center.lat),dy=(cell.p[1]-center.lat)*KM_PER_DEG_LAT,r=Math.hypot(dx,dy);
            const speed=localHurricaneWind(e,h-.5,cell.p)*.44704;
            const tx=r>0?-dy/r:0,ty=r>0?dx/r:0;
            [u,v]=science.blendWindVectors(uMs,vMs,speed*tx,speed*ty,blend);
            if(e.rainIn>0){
              if(center.vmax>=35&&center.vmax<=150)rain+=science.rcliperRainRate(center.vmax,r)*active;
              else rainDomainHours++;
            }
          }
        }
        if((e.type==='heavy_rain'||e.type==='thunderstorm')&&active>0)rain+=e.rainIn*25.4*weight*active/e.durationH;
        baseFFMC=science.hourlyFFMC(baseFFMC,tempC,rhPct,Math.hypot(uMs,vMs)*3.6,backgroundRain,1);
        scenarioFFMC=science.hourlyFFMC(scenarioFFMC,tempC,rhPct,Math.hypot(u,v)*3.6,rain,1);
        totalRain+=rain;
        const index=wins.findIndex(w=>w.leadHours===h);if(index<0||!finite(wins[index].values[cell.i]))continue;
        const b=science.initialSpreadIndex(baseFFMC,Math.hypot(uMs,vMs)*3.6,false),a=science.initialSpreadIndex(scenarioFFMC,Math.hypot(u,v)*3.6,false);
        out[index].baseline[cell.i]=b;out[index].scenario[cell.i]=a;out[index].delta[cell.i]=a-b;
      }
    }
    let span=0,maximum=0;
    for(const w of out) {
      let baseline=0,scenario=0,count=0,published=0,raw=0;
      for(const {i} of selected){
        const b=w.baseline[i],a=w.scenario[i];
        if(finite(b)&&finite(a)){baseline+=b;scenario+=a;count++;maximum=Math.max(maximum,b,a);span=Math.max(span,Math.abs(w.delta[i]));}
        if(finite(w.publishedBaseline[i]))published+=w.publishedBaseline[i];
        if(finite(context?.fields?.rawBaseline?.[i]))raw+=context.fields.rawBaseline[i];
      }
      w.summary={baseline:count?baseline/count:NaN,scenario:count?scenario/count:NaN,delta:count?(scenario-baseline)/count:NaN,
        relative:baseline?(scenario-baseline)/baseline:null,cells:count,areaKm2:count*area,publishedReference:selected.length?published/selected.length:NaN,
        rawReference:context?.fields&&selected.length?raw/selected.length:null};
    }
    for(const w of out)w.span=span;
    const discovery=e&&(e.type==='thunderstorm'||e.type==='hurricane')?{dailyWeights:science.dailyDiscoveryKernel(),
      halfDay:science.halfDayDiscoveryKernel(),holdoverAtScenarioDailyRain:science.holdoverProbability(e.rainIn*25.4*Math.min(24,e.durationH)/e.durationH),
      estimand:'Discovery lag conditional on a matched reported fire',assumption:'Scenario daily rain sensitivity; a full exposure model supplies ignition probability.'}:null;
    return {windows:out,span,maximum,available,endpoint:e?'initial_spread_index':'published_reference',unit:e?'ISI':'score',
      reason:available?null:'Fuel-state treatment rules and a paired spread model are required for a treatment prediction.',
      forcing,assumptions:context?.assumptions||{initialFFMC:85,weather:'Reference 25 °C, RH 30%, 10 km/h, zero background rain'},
      discovery,rainDomainHours,cycloneWindAssumption:e?.type==='hurricane'?'Conditional 1-min peak-wind stress forcing; an interval-mean conversion requires calibration.':null,
      metadata:METADATA,footprint:{cells:selected.length,areaKm2:selected.length*area,indices:Uint32Array.from(selected,c=>c.i)}};
  }
  function windTarget(e,point){
    if(!e.windPath){const b=(e.windFromDeg+180)*Math.PI/180;return [Math.sin(b),Math.cos(b)];}
    let sx=0,sy=0,nearest=Infinity,fallback=[1,0];
    const k=kmPerLon(point[1]);
    for(let i=1;i<e.windPath.length;i++){
      const a=e.windPath[i-1],b=e.windPath[i],dx=(b[0]-a[0])*k,dy=(b[1]-a[1])*KM_PER_DEG_LAT,len=Math.hypot(dx,dy);if(!len)continue;
      const ax=(a[0]-point[0])*k,ay=(a[1]-point[1])*KM_PER_DEG_LAT,t=clamp(-(ax*dx+ay*dy)/(len*len),0,1),d=Math.hypot(ax+t*dx,ay+t*dy),w=Math.exp(-Math.LN2*(d/e.radiusKm)**2);
      sx+=w*dx/len;sy+=w*dy/len;if(d<nearest){nearest=d;fallback=[dx/len,dy/len];}
    }
    const length=Math.hypot(sx,sy);return length>1e-12?[sx/length,sy/length]:fallback;
  }
  function pointInRegion(lon,lat,region){return lon>=region.x0&&lon<=region.x1&&lat>=region.y0&&lat<=region.y1;}

  const api = {
    version: '20261117-research',
    defaults,
    normalize,
    run,
    distance,
    ring,
    footprint: footprintAt,
    inside,
    tcRadius,
    tcWind,
    stormMotion,
    tcEnvelope,
    tcEnvelopeGeometry,
    trackCenter,
    decayedWind,
    timeProfile,
    activeHours,
    windDriver,
    affineCenter,
    areaAt,
    metadata: METADATA,
    parameters: P
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FireCounterfactual = api;
})(typeof window !== 'undefined' ? window : globalThis);

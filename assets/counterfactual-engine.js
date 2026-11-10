'use strict';
/*
 * Deterministic counterfactual rules on Fire Eye's published score field.
 * The score is mapped through a logit only as an illustrative arithmetic proxy:
 * scenario values are uncalibrated modeled occupancy, not probabilities.
 */
(function (root) {
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
  const P = Object.freeze({
    windRefMph: 10,
    windExponent: 1.31,
    windBeta: 0.378,
    windCeilingMph: 58,
    footprintThreshold: 0.3,
    receptiveGate: [0.08, 0.5],
    ignitionGate: [0.03, 0.3],
    windEllipseFactor: 0.5,
    hurricaneWindFactor: 0.8,
    rainFastTauWindows: 0.8,
    rainSlowTauWindows: 4.5,
    rainFastFraction: 0.65,
    rainBeta: 1.8,
    wettingIn: 0.1,
    lightningLag: [0.6, 0.8, 1, 0.7, 0.4, 0.2],
    lightningBeta: 0.2,
    coverageRef: 0.2,
    coverageExponent: 0.7,
    wetDamping: 0.5,
    rxBeta: 2,
    rxHalfLifeYears: 8,
    minLogitInFootprint: 1e-4
  });
  const METADATA = Object.freeze({
    proxy: 'Published score -> logit(score) -> deterministic response -> score. The logit is an illustrative arithmetic proxy, not a probability model.',
    outputs: 'Scenario scores are uncalibrated; no probability, forecast skill, causal-effect, confidence or Monte Carlo claim is made.',
    drivers: 'Only one published field is available. Published score is used as an explicit proxy for the fuel/receptivity driver field; wind and lightning meteorology is not measured by this calculation.',
    footprint: 'The union of all forecast-window influence footprints is selected above the prototype threshold 0.3. Every window summary and area uses that same finite footprint and baseline window.',
    rain: 'Total rain is spread over duration windows, then accumulated in fast (0.8-window) and slow (4.5-window) fuel-memory classes. The slow class is the prototype placeholder.',
    time: 'Moisture starts at issue time and evolves causally in 12-hour steps, including intermediate unpublished windows. Color span is fixed across the run; summaries use each window nodata mask over a shared spatial footprint.',
    hurricaneDecay: 'Track points are 12-hour positions; validHours places the first point on the forecast clock. Landfall decay activates only when optional event.landfallHours is supplied by the caller from its land source. Decay applies to storm strength, without an independent land test. Without landfallHours, no land classification is derived from the published score.',
    burn: 'Burn response applies inside the polygon, using treatedFraction * 0.5^(ageYears/8) and the published-score fuel gate.',
    omitted: 'Downwind spillover, cf-app regional land masking, simulation bands and derived hurricane landfall detection are not applied. The response is deterministic.',
    cells: 'Area is nominal transform cell area (proj4 is not used for area) multiplied by the count of cells finite in the displayed window inside the shared footprint.',
    geometry: 'Each forecast window supplies its own nodata mask. Native affine cell centres are transformed with GDAL coefficients a,b,c,d,e,f; no projection inverse or affine approximation of the Albers grid is assumed.',
    scope: 'The event footprint limits the native cells that receive a response, while summaries use the shared footprint with each window\'s own nodata mask.'
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
  function sigmoid(x) {
    return x < -30 ? 0 : x > 30 ? 1 : 1 / (1 + Math.exp(-x));
  }
  function logit(s) {
    // Preserve exactly zero and one. Finite saturated logits avoid Infinity.
    return s <= 0 ? -30 : s >= 1 ? 30 : Math.max(-30, Math.min(30, Math.log(s / (1 - s))));
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
    if(x<0||y<0||x>=area.width||y>=area.height)return 0;
    return areaField(area)[Math.floor(y)*area.width+Math.floor(x)];
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
    if(event.area)n.area=normalizeArea(event.area);
    if(event.windPath){if(!Array.isArray(event.windPath)||event.windPath.length<2||event.windPath.length>128||event.windPath.some(p=>!validPoint(p)))throw Error('Wind path needs valid points.');n.windPath=event.windPath.map(p=>[...p]);}
    if (event.landfallHours != null && !inRange(event.landfallHours, 0, 100000)) {
      throw new Error('landfallHours must be a non-negative number.');
    }
    if (event.landfallHours != null) n.landfallHours = event.landfallHours;
    if (event.type === 'hurricane') {
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
  function heading(e) {
    const a = e.track[0];
    const b = e.track[e.track.length - 1];
    return (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI + 360) % 360;
  }
  function vortex(vmax, lat, speed = 0) {
    const phi = lat - 25;
    return {
      rm: Math.max(20, 36.1 - 0.0492 * vmax + 0.574 * phi),
      x: clamp(0.1147 + 0.0055 * vmax - 0.001 * phi, 0.05, 1),
      a: Math.max(0, 0.63 - 0.01 * speed + 0.0006 * speed * speed - 0.03 * phi),
      theta0: 15 - 0.55 * phi + 1.02 * speed
    };
  }
  function tcScale(vmax, threshold) {
    const over = Math.max(0, vmax - 94);
    if (threshold === 34) return 1 + 0.0025 * over;
    if (threshold === 64) return (1 - 0.0025 * over) * 0.94;
    return 1;
  }
  // Port of quadrantRadiusAsym: theta is counter-clockwise from storm-motion-right.
  function tcRadius(vmax, lat, threshold, theta, speed = 12) {
    const p = vortex(vmax, lat, speed);
    const asym = p.a * Math.cos((theta - p.theta0) * Math.PI / 180);
    const rhs = threshold - asym;
    if (vmax - p.a + asym <= threshold || rhs <= 0) return 0;
    return p.rm * Math.pow((vmax - p.a) / rhs, 1 / p.x) * tcScale(vmax, threshold) * NMI_TO_KM;
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
    const v0 = 0.9 * landfallKt;
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
    return {
      lon: a[0] * (1 - t) + b[0] * t,
      lat,
      vmax
    };
  }
  function timeProfile(e, leadHours) {
    const wStart = leadHours - 12, wEnd = leadHours;
    const start = e.startH, end = e.startH + e.durationH;
    const overlap = Math.min(wEnd, end) - Math.max(wStart, start);
    if (overlap <= 0) return 0;
    const durationWindows = Math.max(1, e.durationH / 12);
    const midpoint = (Math.max(wStart,start)+Math.min(wEnd,end))/2;
    const position = clamp((midpoint-start)/e.durationH,0,1);
    return overlap / 12 * Math.pow(Math.sin(Math.PI * position), 2);
  }
  function samePoint(p, c) {
    return Math.abs(p[0] - c[0]) < 1e-9 && Math.abs(p[1] - c[1]) < 1e-9;
  }
  function rainAttenuation(moisture, ceiling) {
    const r = clamp(moisture / ceiling, 0, 1);
    return Math.max(0, 1 - 2.59 * r + 5.11 * r * r - 3.52 * r * r * r);
  }
  function rainDamping(fast, slow) {
    const att = P.rainFastFraction * rainAttenuation(0.06 + 0.24 * Math.min(1, fast * 10), 0.25) +
      (1 - P.rainFastFraction) * rainAttenuation(0.06 + 0.24 * Math.min(1, slow * 3), 0.3);
    return Math.min(1, att);
  }
  function windDriver(mph) {
    const u = Math.max(P.windRefMph, mph);
    const uEff = u <= P.windCeilingMph ?
      u : P.windCeilingMph * (1 + Math.log1p((u - P.windCeilingMph) / P.windCeilingMph));
    return Math.log(Math.pow(uEff / P.windRefMph, P.windExponent)) * P.windBeta *
      smoothstep(P.windRefMph, P.windCeilingMph, uEff);
  }
  function footprintAt(e, leadHours, point) {
    if(e.area)return areaAt(e.area,point);
    if(e.type==='high_wind'&&e.windPath){
      let nearest=Infinity;const k=kmPerLon(point[1]);
      for(let i=1;i<e.windPath.length;i++){const a=e.windPath[i-1],b=e.windPath[i],ax=(a[0]-point[0])*k,ay=(a[1]-point[1])*KM_PER_DEG_LAT,dx=(b[0]-a[0])*k,dy=(b[1]-a[1])*KM_PER_DEG_LAT,t=clamp(-(ax*dx+ay*dy)/(dx*dx+dy*dy||1),0,1);nearest=Math.min(nearest,Math.hypot(ax+t*dx,ay+t*dy));}
      return Math.exp(-Math.pow(nearest/(e.radiusKm*.6),2));
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
      return hurricaneResponse(e, c, point);
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
  function hurricaneResponse(e, c, point) {
    const dx = (point[0] - c.lon) * kmPerLon(c.lat);
    const dy = (point[1] - c.lat) * KM_PER_DEG_LAT;
    const bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    const startBearing = (heading(e) + 90 + 360) % 360;
    const theta = (startBearing - bearing + 360) % 360;
    const d = Math.hypot(dx, dy);
    return tcEnvelope(c.vmax, c.lat, d, theta);
  }
  function outerEnvelope(d, r34) {
    if (d <= r34) return 1;
    if (d >= r34 * 1.5) return 0;
    return 1 - (d - r34) / (r34 * 0.5);
  }

  function hasRain(e) {
    return !!e && (e.type === 'heavy_rain' || e.type === 'hurricane' || e.type === 'thunderstorm') &&
      e.rainIn >= P.wettingIn;
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
    const n=g.width*g.height, area=Math.abs(g.transform[0]*g.transform[4]-g.transform[1]*g.transform[3])/1e6;
    const out=wins.map(w=>({leadHours:w.leadHours,targetTime:w.targetTime,baseline:new Float32Array(w.values),scenario:new Float32Array(w.values),delta:Float32Array.from(w.values,v=>Number.isNaN(v)?NaN:0),summary:{}}));
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
        for(let h=12;h<=Math.max(...wins.map(w=>w.leadHours));h+=12) f=Math.max(f,footprintAt(e,h,p));
        if(e.area?f>0:f>=P.footprintThreshold) selected.push({i,p});
      }
    }
    const maxLead=Math.max(...wins.map(w=>w.leadHours));
    for(const c of selected) {
      if(!e) continue;
      let fast=0, slow=0;
      for(let h=12;h<=maxLead;h+=12) {
        const f=footprintAt(e,h,c.p), pulse=timeProfile(e,h);
        const rain=hasRain(e)?e.rainIn/Math.max(1,e.durationH/12)*f*pulse:0;
        fast=fast*Math.exp(-1/P.rainFastTauWindows)+rain;
        slow=slow*Math.exp(-1/P.rainSlowTauWindows)+rain;
        const w=wins.findIndex(w=>w.leadHours===h);
        if(w<0) continue;
        const base=wins[w].values[c.i]; if(!Number.isFinite(base)) continue;
        const gate=smoothstep(...P.receptiveGate,base), ignition=smoothstep(...P.ignitionGate,base);
        let dl=0;
        if(e.type==='high_wind'||e.type==='hurricane') {
          const wind=e.type==='hurricane'?trackCenter(e,h).vmax*1.15078:e.windMph;
          if(Number.isFinite(wind)) dl+=windDriver(wind)*f*pulse*gate*(e.type==='hurricane'?P.hurricaneWindFactor:1);
        }
        if(hasRain(e)) dl-=P.rainBeta*(P.rainFastFraction*fast+(1-P.rainFastFraction)*slow);
        if(e.type==='thunderstorm'||e.type==='hurricane') {
          const lag=P.lightningLag.reduce((sum,k,i)=>sum+k*timeProfile(e,h-i*12),0);
          dl+=P.lightningBeta*Math.pow(e.coverage/P.coverageRef,P.coverageExponent)*f*lag*(e.dry?1:1-P.wetDamping)*ignition;
        }
        if(e.type==='prescribed_burn'&&(e.area?f>0:inside(e.polygon,...c.p))&&h>e.startH)
          dl-=P.rxBeta*e.treatedFraction*Math.pow(.5,e.ageYears/P.rxHalfLifeYears)*gate*(e.area?f:1);
        const after=dl===0||base===0||base===1?base:clamp(sigmoid(logit(base)+dl),0,1);
        out[w].scenario[c.i]=after;
        out[w].delta[c.i]=out[w].scenario[c.i]-base;
      }
    }
    let span=0;
    for(const w of out) {
      let b=0,q=0,count=0;
      for(const {i} of selected) if(Number.isFinite(w.baseline[i])) {b+=w.baseline[i];q+=w.scenario[i];count++;span=Math.max(span,Math.abs(w.delta[i]));}
      b=count?b/count:0;q=count?q/count:0;
      w.summary={baseline:b,scenario:q,delta:q-b,relative:b?(q-b)/b:0,cells:count,areaKm2:count*area};
    }
    for(const w of out) w.span=span;
    return {windows:out,span,metadata:METADATA,footprint:{cells:selected.length,areaKm2:selected.length*area}};
  }

  function pointInRegion(lon, lat, region) {
    return lon >= region.x0 && lon <= region.x1 && lat >= region.y0 && lat <= region.y1;
  }

  const api = {
    version: '20261110-engine-4',
    defaults,
    normalize,
    run,
    distance,
    ring,
    footprint: footprintAt,
    inside,
    tcRadius,
    tcEnvelope,
    tcEnvelopeGeometry,
    trackCenter,
    decayedWind,
    timeProfile,
    affineCenter,
    areaAt,
    metadata: METADATA,
    parameters: P
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FireCounterfactual = api;
})(typeof window !== 'undefined' ? window : globalThis);

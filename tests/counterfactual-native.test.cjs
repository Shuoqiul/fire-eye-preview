const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'latest.json')));
const proj4 = require('../assets/proj4.js');
const model = require('../assets/counterfactual-engine.js');
function fixture() {
  const grid = manifest.runs[0].overview.grid;
  const windows = manifest.runs.map(run => {
    const bytes = fs.readFileSync(path.join(root, manifest.asset_base, run.overview.values.path));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), run.overview.values.sha256);
    const values = new Float32Array(grid.width * grid.height);
    for (let i = 0; i < values.length; i++) {
      const raw = bytes.readUInt16LE(i * 2);
      values[i] = raw === grid.nodata ? NaN : raw * grid.scale;
    }
    return {leadHours:run.lead_hours,targetTime:run.target_time_utc,values};
  });
  return {grid,windows,project:(x,y)=>proj4(grid.proj4,'EPSG:4326',[x,y])};
}
test('bundled published windows retain values and nodata through identity calculation', () => {
  const input = fixture();
  const result = model.run({...input,event:null});
  assert.deepEqual(result.windows.map(w=>w.leadHours), [12,24,36,48]);
  for(let w=0;w<4;w++) {
    const source=input.windows[w].values, output=result.windows[w];
    for(let i=0;i<source.length;i++) {
      if(Number.isNaN(source[i])) assert.ok(Number.isNaN(output.scenario[i]));
      else {assert.equal(output.scenario[i],source[i]);assert.equal(output.delta[i],0);}
    }
  }
});
test('native projected event affects covered cells and leaves the rest intact', () => {
  const input=fixture();
  const event=model.defaults('high_wind',[-120,38]);
  Object.assign(event,{windMph:58,startH:0,durationH:48,radiusKm:150});
  const result=model.run({...input,event});
  let changed=0,unchanged=0;
  for(let w=0;w<4;w++) for(let i=0;i<input.windows[w].values.length;i++) {
    const before=input.windows[w].values[i], after=result.windows[w].scenario[i];
    if(Number.isNaN(before)){assert.ok(Number.isNaN(after));continue;}
    assert.ok(Number.isFinite(after)&&after>=0&&after<=1);
    if(after!==before) changed++; else unchanged++;
  }
  assert.ok(changed>0,'wind changes real published cells');
  assert.ok(unchanged>changed,'native field outside event remains intact');
});

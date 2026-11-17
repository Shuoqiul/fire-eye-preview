const test=require('node:test'),assert=require('node:assert/strict'),data=require('../assets/counterfactual-data.js');
const encode=(values,type='f32')=>Buffer.from(type==='u8'?Uint8Array.from(values).buffer:Float32Array.from(values).buffer).toString('base64');
function fixture(){
 const arrays={};for(const [k,v] of Object.entries({temperatureK:[298.15,NaN],dewpointK:[288.15,NaN],uMs:[1,NaN],vMs:[2,NaN],fuelCode:[101,0],canopyCover:[20,0],rawBaseline:[0,NaN],publishedBaseline:[0,NaN],publicationWeight:[0,NaN]}))arrays[k]=encode(v);
 arrays.validMask=encode([1,0],'u8');return {schemaVersion:1,privateLocalSample:true,grid:{width:2,height:1,transform:[5000,0,0,0,-5000,0],proj4:'EPSG:5070'},issueTimeUtc:'2026-10-27T00:00:00Z',targetTimeUtc:'2026-10-27T12:00:00Z',leadHours:12,publication:{shift:.95,cap:.28},arrays,verification:{validCells:1,publicationBitwiseEqual:true}};
}
test('private sample preserves valid zeros and a distinct raw/published reference contract',()=>{
 const c=data.parse(fixture());assert.equal(c.fields.rawBaseline[0],0);assert.equal(c.windows[0].values[0],0);assert.ok(Number.isNaN(c.windows[0].values[1]));assert.equal(c.weatherAt(1),null);assert.ok(c.weatherAt(0).rhPct<100);assert.match(c.grid.proj4,/NAD83/);
});
test('humidity derives from physical temperature/dewpoint with a declared liquid-water convention',()=>{
 assert.equal(data.relativeHumidity(20,20),100);assert.ok(data.relativeHumidity(20,10)>data.relativeHumidity(20,0));assert.throws(()=>data.relativeHumidity(NaN,10));
});
test('publication transform keeps zero-shift values exactly and caps only shifted cells',()=>{
 assert.equal(data.publication(0,0,{shift:.95,cap:.28}),0);assert.equal(data.publication(.8,0,{shift:.95,cap:.28}),.8);assert.equal(data.publication(.8,1,{shift:.95,cap:.28}),.28);
});
test('tampered publication, mask, time, array length and temperature units are rejected',()=>{
 const a=fixture();a.arrays.publishedBaseline=encode([.5,NaN]);assert.throws(()=>data.parse(a),/Publication/);
 const b=fixture();b.verification.validCells=2;assert.throws(()=>data.parse(b));
 const c=fixture();c.targetTimeUtc='2026-10-28T12:00:00Z';assert.throws(()=>data.parse(c));
 const d=fixture();d.arrays.uMs=encode([1]);assert.throws(()=>data.parse(d));
 const e=fixture();e.arrays.temperatureK=encode([25,NaN]);assert.throws(()=>data.parse(e));
});

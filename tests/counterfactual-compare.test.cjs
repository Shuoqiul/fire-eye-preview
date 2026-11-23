const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),compare=require('../assets/counterfactual-compare.js');
test('Compare uses a fixed signed published-score scale across events and windows',()=>{
  assert.equal(compare.SCALE.limit,.1);
  for(const delta of [.0005,.0261,.1,.15])assert.equal(compare.magnitude(delta),compare.magnitude(-delta));
  assert.ok(compare.magnitude(.0261)<.27);assert.equal(compare.magnitude(.1),1);assert.equal(compare.magnitude(.5),1);
});
test('small positive change remains faint and 0.0261 is pale pink',()=>{
  const tiny=compare.colour(.0005),pale=compare.colour(.0261),strong=compare.colour(.1);
  assert.ok(tiny[1]-tiny[0]<8&&tiny[0]>238);
  assert.ok(pale[1]>185&&pale[0]>238&&strong[0]<235);
  assert.equal(compare.alpha(0),0);assert.ok(compare.alpha(.0005)<.02&&compare.alpha(.0261)<.24&&compare.alpha(.1)>.69);
  assert.ok(compare.colour(-.0261)[2]>compare.colour(-.0261)[0],'negative score changes use blue');assert.ok(compare.colour(.0261)[0]>compare.colour(.0261)[2],'positive score changes use pink');
});
test('Compare script installs the API without CommonJS',()=>{
  const context={};vm.runInNewContext(fs.readFileSync(require.resolve('../assets/counterfactual-compare.js'),'utf8'),context);
  assert.equal(context.FireCompareDisplay.SCALE.limit,.1);
});

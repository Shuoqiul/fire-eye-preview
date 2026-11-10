'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const symbols = require('../assets/counterfactual-symbols.js');

const svgOpen = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" class="[^"]+" viewBox="0 0 24 \d+" aria-hidden="true">/;

test('exports the pure symbol API through CommonJS', () => {
  assert.deepEqual(Object.keys(symbols), [
    'PALETTE', 'cycloneSvg', 'lightningSvg', 'rainSvg', 'intensity', 'precipDrops'
  ]);
  assert.equal(symbols.PALETTE.severeTropicalStorm, '#0f8000');
  assert.equal(symbols.PALETTE.extratropical, '#5b5555');
});

test('UMD script installs the same API on window without CommonJS', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/counterfactual-symbols.js'), 'utf8'), { window });
  assert.equal(typeof window.FireWeatherSymbols.cycloneSvg, 'function');
  assert.equal(window.FireWeatherSymbols.rainSvg(2, 'currentColor'), symbols.rainSvg(2, 'currentColor'));
});

test('cyclone is a hollow-eye ring and thin-tail vector with inherited currentColor', () => {
  const result = symbols.cycloneSvg('currentColor');
  assert.match(result, svgOpen);
  assert.match(result, /class="cf-cyclone-spin"/);
  assert.match(result, /fill-rule="evenodd"/);
  assert.match(result, /fill="currentColor"/);
  assert.match(result, /A2\.65 2\.65 0 1 1/);
  assert.equal([...result.matchAll(/<svg\b/g)].length, 1);
  assert.equal([...result.matchAll(/<\/svg>/g)].length, 1);
  assert.doesNotMatch(result, /image|rect|background|<text|#fff/i);
});

test('lightning uses a broad angular bolt path and no enclosing frame', () => {
  const result = symbols.lightningSvg('#eed008');
  assert.match(result, svgOpen);
  assert.match(result, /class="cf-lightning"/);
  assert.match(result, /fill="#eed008"/);
  assert.ok((result.match(/[HL]/g) || []).length >= 9, 'stepped silhouette includes three shoulders');
  assert.doesNotMatch(result, /<rect|<image|background|<text/i);
});

test('rain SVG exposes exactly the requested drop count below a single cloud', () => {
  for (const count of [0, 1, 2, 4, 7, 10, 31, 250]) {
    const result = symbols.rainSvg(count, 'currentColor');
    assert.match(result, svgOpen);
    assert.match(result, /class="cf-rainstorm"/);
    assert.equal([...result.matchAll(/data-drop="\d+"/g)].length, count);
    assert.equal([...result.matchAll(/<path /g)].length, count + 1);
    assert.match(result, /fill="currentColor"/);
    assert.doesNotMatch(result, /<rect|<image|background|<text/i);
  }
  assert.throws(() => symbols.rainSvg(2.5, 'blue'), RangeError);
  assert.throws(() => symbols.rainSvg(-1, 'blue'), RangeError);
});

test('rain amount converts to integer drops including the 0.4-inch square-grid case', () => {
  assert.equal(symbols.precipDrops(0), 0);
  assert.equal(symbols.precipDrops(0.2), 1);
  assert.equal(symbols.precipDrops(0.4), 2);
  assert.equal(symbols.precipDrops(0.6), 3);
  assert.equal(symbols.precipDrops(1), 5);
  assert.equal(symbols.precipDrops(0.01), 1);
  assert.equal(symbols.precipDrops(-0.2), 0);
  assert.equal(symbols.precipDrops(Number.NaN), 0);
});

test('CMA wind thresholds use knot-to-m/s conversion and sampled palette', () => {
  const strongTs = 24.5 / 0.514444;
  const typhoon = 32.7 / 0.514444;
  const severeTyphoon = 41.5 / 0.514444;
  const superTyphoon = 51 / 0.514444;
  const below = 10.8 / 0.514444;
  assert.deepEqual(symbols.intensity(strongTs - 0.01), {
    label: 'Tropical storm', color: '#0000ff'
  });
  assert.deepEqual(symbols.intensity(strongTs), {
    label: 'Severe tropical storm', color: '#0f8000'
  });
  assert.deepEqual(symbols.intensity(typhoon), {
    label: 'Typhoon', color: '#fe9c45'
  });
  assert.deepEqual(symbols.intensity(severeTyphoon), {
    label: 'Severe typhoon', color: '#fe00fe'
  });
  assert.deepEqual(symbols.intensity(superTyphoon), {
    label: 'Super typhoon', color: '#fe0000'
  });
  assert.deepEqual(symbols.intensity(below - 0.01), {
    label: 'Below tropical depression', color: '#8c9caa'
  });
  assert.equal(symbols.intensity(10.8 / 0.514444).color, '#eed008');
  assert.equal(symbols.intensity(17.2 / 0.514444).color, '#0000ff');
});

test('every output is a single transparent well-formed SVG root', () => {
  const outputs = [
    symbols.cycloneSvg('currentColor'),
    symbols.lightningSvg('currentColor'),
    symbols.rainSvg(2, 'currentColor')
  ];
  for (const result of outputs) {
    assert.equal([...result.matchAll(/<svg\b/g)].length, 1);
    assert.equal([...result.matchAll(/<\/svg>/g)].length, 1);
    assert.match(result, /^<svg\b[^>]*>[\s\S]*<\/svg>$/);
    assert.doesNotMatch(result, /<(?:rect|image)\b|\bbackground\b|<text\b/i);
  }
});

test('SVG colour attributes escape markup and large rain counts expand the viewport', () => {
  assert.doesNotMatch(symbols.rainSvg(2, '\"/><image href=\"x'), /<image/);
  assert.ok(Number(symbols.rainSvg(250).match(/viewBox="0 0 24 (\d+)"/)[1]) > 24);
});

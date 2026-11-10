(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FireWeatherSymbols = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Colours sampled from the flat cyclone dots in example_figs/hurricane.jpg.
  const PALETTE = Object.freeze({
    belowDepression: '#8c9caa',
    tropicalDepression: '#eed008',
    tropicalStorm: '#0000ff',
    severeTropicalStorm: '#0f8000',
    typhoon: '#fe9c45',
    severeTyphoon: '#fe00fe',
    superTyphoon: '#fe0000',
    extratropical: '#5b5555'
  });

  const LEVELS = Object.freeze([
    { mps: 51, label: 'Super typhoon', color: PALETTE.superTyphoon },
    { mps: 41.5, label: 'Severe typhoon', color: PALETTE.severeTyphoon },
    { mps: 32.7, label: 'Typhoon', color: PALETTE.typhoon },
    { mps: 24.5, label: 'Severe tropical storm', color: PALETTE.severeTropicalStorm },
    { mps: 17.2, label: 'Tropical storm', color: PALETTE.tropicalStorm },
    { mps: 10.8, label: 'Tropical depression', color: PALETTE.tropicalDepression }
  ]);

  // Clean vector fits to the glyph panels on physical PDF pages 6, 7 and 13.
  // The warning-card lettering, border and background are intentionally excluded.
  const CYCLONE_PATH = 'M1 12C.8 17.7 5.6 21.4 9.8 21.4C15.6 21.4 19.6 17.1 19.6 12C19.6 8.7 18.4 6.7 15.4 5.35C19.3 5.2 22.8 7.8 23 12C23.3 6.8 18.8 2.65 13.65 2.65C8.55 2.65 4.4 6.9 4.4 11.7C4.4 15 5.7 17.3 8.5 18.75C4.65 18.85 1.2 16.7 1 12ZM14.57 11.75A2.65 2.65 0 1 1 9.27 11.75A2.65 2.65 0 1 1 14.57 11.75Z';
  const LIGHTNING_PATH = 'M11.15 1H21.58L11.81 8.68H18.35L11.53 14.47H14.94L2.42 23L7.16 16.55H4.89L8.49 10.67H5.65Z';
  const CLOUD_PATH = 'M1 10C1 7.9 2.7 7.7 4.5 8.3C5.3 6.7 6.8 6.5 8.4 6.7C8.9 6.1 9.6 5.7 10.2 5.6C10.3 2.5 11.7 1.5 14.1 1.5C16.6 1.5 18.1 3.5 18.1 5.7C20.3 5.6 21.2 7 21.5 8.1C23.8 8.4 23.7 11.4 22.2 12.3C21.4 12.8 20.7 12.6 19.8 12.6C18.7 13.3 17.5 12.6 16.3 13.1C15 13.3 14.6 12.9 13.7 13.6C12.2 14.5 10.3 14.3 9.3 13.7C7.7 14.3 6.1 13.9 5.2 13.2C3.1 14.3 1 12.6 1 10Z';
  const DROP_PATH = 'M0-3.8C-1.1-2.1-2.55.1-2.55 1.4C-2.55 4.6 2.55 4.6 2.55 1.4C2.55.1 1.1-2.1 0-3.8Z';

  function colorOf(color) {
    const value = color == null || color === '' ? 'currentColor' : String(color);
    return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function svg(className, body, height = 24) {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" viewBox="0 0 24 ${height}" aria-hidden="true">${body}</svg>`;
  }

  function cycloneSvg(color) {
    return svg('cf-cyclone-spin', `<path fill="${colorOf(color)}" fill-rule="evenodd" d="${CYCLONE_PATH}"/>`);
  }

  function lightningSvg(color) {
    return svg('cf-lightning', `<path fill="${colorOf(color)}" d="${LIGHTNING_PATH}"/>`);
  }

  function rainSvg(drops, color) {
    const count = drops == null ? 4 : Number(drops);
    if (!Number.isInteger(count) || count < 0 || count > 250) {
      throw new RangeError('Drop count must be an integer from 0 to 250 (50 inches).');
    }
    const columns = Math.max(1, Math.min(12, count));
    const rows = Math.ceil(count / columns), spacing = Math.min(5.5, 21 / columns);
    const scale = Math.min(.85, spacing / 5.6), rowHeight = 8.4 * scale;
    const height = Math.max(24, Math.ceil(18 + Math.max(0, rows - 1) * rowHeight + 4 * scale));
    let markup = '';
    for (let i = 0; i < count; i += 1) {
      const row = Math.floor(i / columns), inRow = Math.min(columns, count - row * columns);
      const x = 12 + ((i % columns) - (inRow - 1) / 2) * spacing, y = 18 + row * rowHeight;
      markup += `<path data-drop="${i + 1}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(3)})" d="${DROP_PATH}"/>`;
    }
    return svg('cf-rainstorm', `<g fill="${colorOf(color)}"><path d="${CLOUD_PATH}"/>${markup}</g>`, height);
  }

  function intensity(vmaxKt) {
    if (!Number.isFinite(Number(vmaxKt))) throw new TypeError('Maximum wind must be a finite number.');
    const mps = Math.abs(Number(vmaxKt)) * 0.514444;
    const level = LEVELS.find(item => mps >= item.mps);
    return level
      ? { label: level.label, color: level.color }
      : { label: 'Below tropical depression', color: PALETTE.belowDepression };
  }

  function precipDrops(rainIn) {
    const amount = Number(rainIn);
    if (!Number.isFinite(amount) || amount < 0) return 0;
    if (amount === 0) return 0;
    return Math.max(1, Math.floor(amount / 0.2 + 1e-9));
  }

  return Object.freeze({
    PALETTE,
    cycloneSvg,
    lightningSvg,
    rainSvg,
    intensity,
    precipDrops
  });
}));

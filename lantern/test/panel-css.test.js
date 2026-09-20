const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'panel.css'), 'utf8');

function contrast(hexA, hexB) {
  const lum = (hex) => {
    const rgb = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255);
    const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const [lighter, darker] = [lum(hexA), lum(hexB)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test('panel drag and resize controls reserve touch gestures for their pointer handlers', () => {
  assert.match(css, /\.ln-head\s*\{[^}]*touch-action:\s*none;/s);
  assert.match(css, /\.ln-grip\s*\{[^}]*touch-action:\s*none;/s);
});

test('a narrow viewport gives a positioned panel an eight-pixel inset on both sides', () => {
  assert.match(css,
    /@media\s*\(max-width:\s*560px\)\s*\{[\s\S]*?\.ln-panel\s*\{[^}]*left:\s*8px;[^}]*right:\s*8px;[^}]*max-width:\s*calc\(100vw\s*-\s*16px\);/);
});

test('action and tab rows wrap when a desktop panel is resized narrowly', () => {
  assert.match(css, /\.ln-tabs\s*\{[^}]*flex-wrap:\s*wrap;/s);
  assert.match(css, /\.ln-small-actions\s*\{[^}]*flex-wrap:\s*wrap;/s);
  assert.match(css, /\.ln-small-actions\s+\.ln-btn\s*\{[^}]*flex:\s*1\s+1\s+120px;[^}]*min-width:\s*0;/s);
});

test('text inputs and textareas share an opaque accessible placeholder color', () => {
  assert.match(css, /\.ln textarea::placeholder,\s*\.ln input\[type="text"\]::placeholder\s*\{[^}]*color:\s*var\(--fg-soft\);[^}]*opacity:\s*1;/s);
});

test('dark controls have a visible three-to-one boundary contrast', () => {
  const light = css.match(/\.ln\s*\{([\s\S]*?)\}/);
  const block = css.match(/\.ln\[data-dark\]\s*\{([\s\S]*?)\}/);
  assert.ok(light && block);
  [light[1], block[1]].forEach(palette => {
    const line = palette.match(/--line:\s*(#[a-f\d]{6})/i);
    const surface = palette.match(/--bg-soft:\s*(#[a-f\d]{6})/i);
    assert.ok(line && surface);
    assert.ok(contrast(line[1], surface[1]) >= 3);
  });
});

test('help controls inherit the chosen panel text size through valid font declarations', () => {
  ['ln-help-btn', 'ln-help-q', 'ln-help-more'].forEach(className => {
    const rule = css.match(new RegExp('\\.' + className + '\\s*\\{([\\s\\S]*?)\\}'));
    assert.ok(rule, className);
    assert.match(rule[1], /font:\s*inherit;/);
    assert.match(rule[1], /font-size:\s*calc\(var\(--ln-fs\)/);
  });
});
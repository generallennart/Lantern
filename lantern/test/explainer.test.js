const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const payload = JSON.parse(fs.readFileSync(path.join(root, 'src', 'explainer.json'), 'utf8'));

function assertCards(cards, label) {
  assert.ok(Array.isArray(cards), label + ' should be an array');
  assert.ok(cards.length, label + ' should not be empty');
  const ids = new Set();
  cards.forEach((card, index) => {
    const cardLabel = label + '[' + index + ']';
    assert.equal(typeof card.id, 'string', cardLabel + ' should have an id');
    assert.match(card.id, /^[a-z0-9_-]+$/, cardLabel + ' should have a stable id');
    assert.equal(ids.has(card.id), false, label + ' has duplicate id ' + card.id);
    ids.add(card.id);
    ['q', 'a'].forEach(part => ['de', 'en'].forEach(lang => {
      assert.ok(String(card[part] && card[part][lang] || '').trim(),
        cardLabel + ' is missing ' + part + '.' + lang);
    }));
    if (Object.hasOwn(card, 'more')) assertCards(card.more, cardLabel + '.more');
  });
}

test('the deferred explainer is declared, complete, and outside the initial content-script payload', () => {
  const resources = manifest.web_accessible_resources.flatMap(entry => entry.resources);
  assert.equal(resources.includes('src/explainer.json'), true);
  assert.equal(manifest.content_scripts[0].js.includes('src/explainer.json'), false);

  assertCards(payload.explainer, 'explainer');
  assertCards(payload.explainerTennis, 'explainerTennis');

  const rulesSource = fs.readFileSync(path.join(root, 'src', 'rules.js'), 'utf8');
  assert.equal(/^\s*explainer(?:Tennis)?:/m.test(rulesSource), false,
    'explainer cards should not be parsed with rules.js on every page load');

  const contentBytes = manifest.content_scripts[0].js.reduce((total, relativePath) =>
    total + fs.statSync(path.join(root, relativePath)).size, 0);
  assert.ok(contentBytes < 600 * 1024,
    'always-loaded content scripts should remain below the 600 KiB budget');
});
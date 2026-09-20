const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const packageInfo = require(path.join(__dirname, '..', 'package.json'));

class FakeElement {
  constructor(id) {
    this.id = id;
    this.value = '';
    this.checked = false;
    this.hidden = false;
    this.textContent = '';
    this.dataset = {};
    this.style = { setProperty() {} };
    this.attributes = {};
    this.listeners = {};
    this.buttons = [];
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  dispatch(type) {
    this.listeners[type]({ target: this });
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  querySelectorAll() {
    return this.buttons;
  }

  querySelector(selector) {
    const match = selector.match(/data-(?:accent|size)="([^"]+)"/);
    if (!match) return null;
    return this.buttons.find(button =>
      button.dataset.accent === match[1] || button.dataset.size === match[1]
    ) || null;
  }
}

function buildSegment(name, values) {
  const labels = {
    green: 'pAccentGreen', blue: 'pAccentBlue', violet: 'pAccentViolet',
    rose: 'pAccentRose', slate: 'pAccentSlate'
  };
  const segment = new FakeElement(name);
  segment.buttons = values.map(value => {
    const button = new FakeElement(name + '-' + value);
    button.dataset[name === 'sizeSeg' ? 'size' : 'accent'] = value;
    if (name === 'accentSeg') button.dataset.tLabel = labels[value];
    return button;
  });
  return segment;
}

function runPopup(savedSettings, resetError, readError, updateResponse) {
  const ids = [
    'lang', 'pagelayer', 'statuscheck', 'updatecheck', 'intro', 'introDone', 'rv',
    'rulesUrl', 'diag', 'diagOut', 'rulesCheck', 'rulesOut', 'reset',
    'resetConfirm', 'resetYes', 'resetNo', 'resetDone', 'resetFailed', 'statsBox', 'statsOut',
    'updateBox', 'updateTitle', 'updateBody', 'updateGuide', 'updateRelease'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new FakeElement(id)]));
  elements.updateBox.hidden = true;
  elements.sizeSeg = buildSegment('sizeSeg', ['small', 'normal', 'gross', 'sehr', 'riesig']);
  elements.accentSeg = buildSegment('accentSeg', ['green', 'blue', 'violet', 'rose', 'slate']);
  const rootStyle = { values: {}, setProperty(name, value) { this.values[name] = value; } };
  const document = {
    getElementById(id) { return elements[id]; },
    querySelectorAll(selector) { return selector === '[data-t-label]' ? elements.accentSeg.buttons : []; },
    createElement(tag) { return new FakeElement(tag); },
    documentElement: { style: rootStyle, lang: '' }
  };
  const storeWrites = [];
  const runtime = {
    getManifest() { return { version: packageInfo.version }; },
    lastError: null,
    sendMessage(message, callback) {
      if (message && message.type === 'LN_UPDATE_STATUS' && callback) {
        callback(updateResponse || { enabled: true, available: false });
      } else if (callback) callback({ ok: true });
    }
  };
  const storage = {
    get(_keys, callback) {
      if (readError) runtime.lastError = { message: readError };
      callback({ lnSettings: savedSettings, lnRulesOverride: { version: '9.9.9' } });
      runtime.lastError = null;
    },
    set(_value, callback) { if (callback) callback(); },
    remove(_keys, callback) { if (callback) callback(); }
  };
  const window = {
    LN_I18N: {
      en: {
        pAccentGreen: 'Green', pAccentBlue: 'Blue', pAccentViolet: 'Violet', pAccentRose: 'Berry', pAccentSlate: 'Slate',
        pUpdateTitle: 'New Lantern version {v}', pUpdateBody: 'A new version is ready.'
      },
      de: {
        pAccentGreen: 'Grün', pAccentBlue: 'Blau', pAccentViolet: 'Violett', pAccentRose: 'Beere', pAccentSlate: 'Grau',
        pUpdateTitle: 'Neue Lantern-Version {v}', pUpdateBody: 'Eine neue Version ist bereit.'
      }
    },
    LN_STORE: {
      load(callback) { callback({ lnSettings: savedSettings, lnRulesOverride: { version: '9.9.9' } }); },
      set(value, callback) { storeWrites.push(value); if (callback) callback(); },
      reset(callback) { callback(resetError || null); }
    }
  };
  const sandbox = {
    window,
    document,
    chrome: {
      storage: { local: storage },
      runtime,
      tabs: { query() {} }
    },
    navigator: { language: 'en-US' },
    getComputedStyle() { return { backgroundColor: '#0f7a5a' }; },
    setTimeout() { return 0; },
    clearTimeout() {},
    console
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'popup', 'popup.js'), 'utf8'),
    sandbox,
    { filename: 'popup.js' }
  );
  return { elements, rootStyle, storeWrites };
}

test('popup reset restores every visible setting and the bundled version', () => {
  const { elements } = runPopup({
    lang: 'de',
    pageLayer: false,
    statusCheck: true,
    updateCheck: false,
    rulesUrl: 'https://example.test/rules.json',
    textSize: 'riesig',
    accent: 'blue'
  });

  elements.reset.dispatch('click');
  elements.resetYes.dispatch('click');

  assert.equal(elements.lang.value, 'auto');
  assert.equal(elements.pagelayer.checked, true);
  assert.equal(elements.statuscheck.checked, false);
  assert.equal(elements.updatecheck.checked, true);
  assert.equal(elements.rulesUrl.value, '');
  assert.equal(elements.sizeSeg.buttons.find(button => button.dataset.size === 'normal').attributes['aria-pressed'], 'true');
  assert.equal(elements.accentSeg.buttons[0].attributes['aria-pressed'], 'true');
  assert.equal(elements.rv.textContent, packageInfo.version);
});

test('popup does not claim reset success when storage reports an error', () => {
  const { elements } = runPopup({}, 'storage unavailable');

  elements.reset.dispatch('click');
  elements.resetYes.dispatch('click');

  assert.equal(elements.resetDone.hidden, true);
  assert.equal(elements.resetFailed.hidden, false);
});

test('a failed settings read does not overwrite existing settings', () => {
  const { elements, storeWrites } = runPopup({ tennis: true, box: { left: 40, top: 40, w: 400, h: 500 } }, null, 'storage unavailable');

  elements.pagelayer.checked = false;
  elements.pagelayer.dispatch('change');

  assert.equal(storeWrites.length, 0);
});

test('popup accent swatches receive localized accessible names', () => {
  const { elements } = runPopup({});

  assert.equal(elements.accentSeg.buttons[0].attributes['aria-label'], 'Green');
  assert.equal(elements.accentSeg.buttons[4].attributes['aria-label'], 'Slate');
});

test('popup only shows an update notice for a newer release', () => {
  const current = runPopup({}, null, null, { enabled: true, available: false });
  const newer = runPopup({}, null, null, {
    enabled: true,
    available: true,
    version: '1.0.1',
    url: 'https://github.com/generallennart/Lantern/releases/tag/v1.0.1'
  });

  assert.equal(current.elements.updateBox.hidden, true);
  assert.equal(newer.elements.updateBox.hidden, false);
  assert.equal(newer.elements.updateTitle.textContent, 'New Lantern version 1.0.1');
  assert.equal(newer.elements.updateBody.textContent, 'A new version is ready.');
});

test('popup persists the update-check opt-out', () => {
  const { elements, storeWrites } = runPopup({ updateCheck: false });

  assert.equal(elements.updatecheck.checked, false);
  elements.updatecheck.checked = true;
  elements.updatecheck.dispatch('change');

  assert.equal(storeWrites.at(-1).lnSettings.updateCheck, true);
});
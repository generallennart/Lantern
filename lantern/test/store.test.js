const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function loadStore(chrome) {
  const file = path.join(__dirname, '..', 'src', 'store.js');
  delete require.cache[require.resolve(file)];
  global.chrome = chrome;
  return require(file);
}

function sourceOf(...parts) {
  return fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
}

function writingStore() {
  let written = null;
  const chrome = {
    runtime: { id: 'test-extension', lastError: null },
    storage: {
      local: {
        get(_keys, callback) { callback({}); },
        set(value, callback) { written = value; callback(); },
        remove(_keys, callback) { if (callback) callback(); }
      }
    }
  };
  return { store: loadStore(chrome), written: () => written };
}

/* The panel and the popup both offer a text size, but the schema decides what
 * survives a write. When they disagree the control looks live and does
 * nothing, which is how the 'small' size shipped dead. */
test('every text size the panel and popup offer survives a settings write', () => {
  const panelSizes = Object.keys(
    Object.fromEntries(
      [...(/const TEXT_SIZES = \{([^}]*)\}/.exec(sourceOf('src', 'content.js')) || [, ''])[1]
        .matchAll(/(\w+)\s*:/g)].map(m => [m[1], true])
    )
  );
  const popupSizes = [...(/const TEXT_SIZES = \[([^\]]*)\]/.exec(sourceOf('popup', 'popup.js')) || [, ''])[1]
    .matchAll(/'([^']+)'/g)].map(m => m[1]);

  assert.ok(panelSizes.includes('small'), 'panel should offer a smaller size than the default');
  assert.deepEqual(popupSizes, panelSizes);

  panelSizes.forEach(size => {
    const { store, written } = writingStore();
    store.set({ lnSettings: { textSize: size } });
    assert.equal(written().lnSettings.textSize, size, size + ' should survive the schema');
  });
});

test('an unknown text size is still refused before it reaches CSS', () => {
  const { store, written } = writingStore();

  store.set({ lnSettings: { textSize: 'enormous' } });

  assert.equal('textSize' in written().lnSettings, false);
});

test('update metadata keeps only its checked time and numeric release version', () => {
  const { store, written } = writingStore();

  store.set({
    lnSettings: { updateCheck: false },
    lnUpdate: { checkedAt: 1234, version: '1.0.1', title: 'Untrusted release text', url: 'https://elsewhere.example/' }
  });

  assert.equal(written().lnSettings.updateCheck, false);
  assert.deepEqual(written().lnUpdate, { checkedAt: 1234, version: '1.0.1' });
  assert.equal(store.KEYS.includes('lnUpdate'), true);
});

test('update metadata rejects non-release version shapes', () => {
  const { store, written } = writingStore();

  store.set({ lnUpdate: { checkedAt: 1234, version: '1.0' } });

  assert.deepEqual(written().lnUpdate, { checkedAt: 1234 });
});

test('a handover carry preserves its automatic-insertion marker', () => {
  const { store, written } = writingStore();

  store.set({
    lnCarry: { text: 'Continue from this handover.', ts: Date.now(), lang: 'en', autoInsert: true }
  });

  assert.equal(written().lnCarry.autoInsert, true);
});

test('a failed migration write reports storage failure instead of silently succeeding', () => {
  const chrome = {
    runtime: { id: 'test-extension', lastError: null },
    storage: {
      local: {
        get(_keys, callback) { callback({ lnDraft: 'corrupt' }); },
        set(_value, callback) {
          chrome.runtime.lastError = { message: 'QUOTA_BYTES exceeded' };
          callback();
          chrome.runtime.lastError = null;
        },
        remove(_keys, callback) { if (callback) callback(); }
      }
    }
  };
  const store = loadStore(chrome);
  const failures = [];
  store.onFail(kind => failures.push(kind));

  store.load(() => {});

  assert.deepEqual(failures, ['storage']);
});

test('writes apply the same caps and URL validation as loads', () => {
  let written = null;
  const chrome = {
    runtime: { id: 'test-extension', lastError: null },
    storage: {
      local: {
        get(_keys, callback) { callback({}); },
        set(value, callback) { written = value; callback(); },
        remove(_keys, callback) { if (callback) callback(); }
      }
    }
  };
  const store = loadStore(chrome);

  store.set({
    lnDraft: { text: 'x'.repeat(50000), parts: ['y'.repeat(50000)] },
    lnSettings: { rulesUrl: 'https://user:secret@rules.example/rules.json', accent: 'blue' },
    lnRulesOverride: { version: '999999.0.0', archetypes: [{ id: 'write' }], goals: [{ id: 'artifact' }] }
  });

  assert.equal(written.lnDraft.text.length, 40000);
  assert.equal(written.lnDraft.parts[0].length, 40000);
  assert.equal('rulesUrl' in written.lnSettings, false);
  assert.equal(written.lnSettings.accent, 'blue');
  assert.equal('lnRulesOverride' in written, false);
});

test('load adopts legacy keys, removes obsolete draft fields, and keeps valid neighbors', () => {
  let written = null;
  let removed = null;
  const chrome = {
    runtime: { id: 'test-extension', lastError: null },
    storage: {
      local: {
        get(_keys, callback) {
          callback({
            ktDraft: { text: 'legacy draft', tier: 'deep', modelChoice: 'opus' },
            ktSettings: { accent: 'blue' },
            lnHistory: [{ text: 'kept history', unknown: 'discarded' }]
          });
        },
        set(value, callback) { written = value; callback(); },
        remove(keys, callback) { removed = keys; callback(); }
      }
    }
  };
  const store = loadStore(chrome);
  let loaded = null;
  let info = null;

  store.load((data, result) => { loaded = data; info = result; });

  assert.equal(loaded.lnDraft.text, 'legacy draft');
  assert.equal(loaded.lnDraft.modelChoice, 'opus');
  assert.equal('tier' in loaded.lnDraft, false);
  assert.equal(loaded.lnSettings.accent, 'blue');
  assert.equal(loaded.lnHistory[0].unknown, undefined);
  assert.equal(info.adopted.includes('ktDraft'), true);
  assert.equal(written.lnSchema.v, 2);
  assert.equal(removed.includes('ktDraft'), true);
});

test('the opt-in improvement toggle clears the old automatic default during migration', () => {
  let written = null;
  const chrome = {
    runtime: { id: 'test-extension', lastError: null },
    storage: {
      local: {
        get(_keys, callback) {
          callback({
            lnSchema: { v: 1 },
            lnDraft: { text: 'old draft', improve: true },
            lnSettings: { temporaryChat: true, accent: 'blue' }
          });
        },
        set(value, callback) { written = value; callback(); },
        remove(_keys, callback) { callback(); }
      }
    }
  };
  const store = loadStore(chrome);
  let loaded = null;

  store.load(data => { loaded = data; });

  assert.equal(store.VERSION, 2);
  assert.equal('improve' in loaded.lnDraft, false);
  assert.equal('improve' in written.lnDraft, false);
  assert.equal('temporaryChat' in loaded.lnSettings, false);
  assert.equal('temporaryChat' in written.lnSettings, false);
});

test('reset reports a storage failure instead of claiming completion', () => {
  const chrome = {
    runtime: { id: 'test-extension', lastError: null },
    storage: {
      local: {
        get(_keys, callback) { callback({}); },
        set(_value, callback) { callback(); },
        remove(_keys, callback) {
          chrome.runtime.lastError = { message: 'storage unavailable' };
          callback();
          chrome.runtime.lastError = null;
        }
      }
    }
  };
  const store = loadStore(chrome);
  const failures = [];
  let resetError = null;
  store.onFail(kind => failures.push(kind));

  store.reset(error => { resetError = error; });

  assert.deepEqual(failures, ['storage']);
  assert.match(resetError, /storage unavailable/);
});

test('reset clears only Lantern-owned keys and reinitializes the schema', () => {
  let removed = null;
  let written = null;
  const chrome = {
    runtime: { id: 'test-extension', lastError: null },
    storage: {
      local: {
        get(_keys, callback) { callback({}); },
        set(value, callback) { written = value; callback(); },
        remove(keys, callback) { removed = keys; callback(); }
      }
    }
  };
  const store = loadStore(chrome);
  let resetError = 'not called';

  store.reset(error => { resetError = error; });

  assert.equal(resetError, null);
  assert.deepEqual(removed.slice().sort(), store.KEYS.concat(store.LEGACY_KEYS).sort());
  assert.deepEqual(written, { lnSchema: { v: store.VERSION } });
});
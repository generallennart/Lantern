const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const contentSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'content.js'),
  'utf8'
);

function contentFunction(name, nextMarker, dependencies) {
  const start = contentSource.indexOf('  function ' + name + '(');
  const end = contentSource.indexOf(nextMarker, start);
  assert.notEqual(start, -1, name + ' should exist');
  assert.notEqual(end, -1, name + ' should have a stable boundary');
  const source = contentSource.slice(start, end);
  const names = Object.keys(dependencies);
  return new Function(...names, source + '\nreturn ' + name + ';')(
    ...names.map(name => dependencies[name])
  );
}

function explainerApi(dependencies) {
  const start = contentSource.indexOf('  let explainerText = null;');
  const end = contentSource.indexOf('\n\n  function openHelp()', start);
  assert.notEqual(start, -1, 'explainer cache should exist');
  assert.notEqual(end, -1, 'explainer cache should end before openHelp');
  const source = contentSource.slice(start, end);
  const names = Object.keys(dependencies);
  return new Function(...names, source + '\nreturn { loadExplainer, explainerCards };')(
    ...names.map(name => dependencies[name])
  );
}

test('keyboard goal correction rebuilds an already-visible result', () => {
  let rebuilt = 0;
  const chips = [
    { dataset: { goal: 'answer' }, focus() {} },
    { dataset: { goal: 'artifact' }, focus() {} }
  ];
  const state = { goal: 'answer', manualGoal: false, corrected: false, manualAtText: '' };
  const onGoalKeys = contentFunction('onGoalKeys', '\n\n  function setTab', {
    els: {
      goals: { querySelectorAll() { return chips; } },
      result: { hidden: false },
      text: { value: 'clear request' }
    },
    state,
    paintGoals() {},
    refresh() {},
    save() {},
    doBuild() { rebuilt++; }
  });

  let prevented = false;
  onGoalKeys({ key: 'ArrowRight', preventDefault() { prevented = true; } });

  assert.equal(prevented, true);
  assert.equal(state.goal, 'artifact');
  assert.equal(state.manualGoal, true);
  assert.equal(state.corrected, true);
  assert.equal(rebuilt, 1);
});

test('explainer loading retries after a transient fetch failure', async () => {
  let fetches = 0;
  const api = explainerApi({
    chrome: { runtime: { getURL() { return 'chrome-extension://test/src/explainer.json'; } } },
    fetch() {
      fetches++;
      if (fetches === 1) return Promise.reject(new Error('temporary failure'));
      return Promise.resolve({
        ok: true,
        json() { return Promise.resolve({ explainer: [{ id: 'loaded' }] }); }
      });
    },
    R() { return {}; },
    window: {}
  });

  assert.equal(await api.loadExplainer(), null);
  const loaded = await api.loadExplainer();

  assert.equal(fetches, 2);
  assert.deepEqual(loaded.explainer, [{ id: 'loaded' }]);
});

test('a hosted explainer override wins after explainer data moved out of rules.js', () => {
  const override = [{
    id: 'hosted-card',
    q: { de: 'Frage', en: 'Question' },
    a: { de: 'Antwort', en: 'Answer' }
  }];
  const api = explainerApi({
    chrome: { runtime: { getURL() { return 'chrome-extension://test/src/explainer.json'; } } },
    fetch() { return Promise.reject(new Error('not needed')); },
    R() { return {}; },
    window: { LN_RULES_OVERRIDE: { explainer: override } }
  });

  assert.equal(api.explainerCards('explainer'), override);
});

test('malformed hosted explainer cards fall back instead of rendering arbitrary data', () => {
  const fallback = [{
    id: 'bundled-card',
    q: { de: 'Gebündelte Frage', en: 'Bundled question' },
    a: { de: 'Gebündelte Antwort', en: 'Bundled answer' }
  }];
  const api = explainerApi({
    chrome: { runtime: { getURL() { return 'chrome-extension://test/src/explainer.json'; } } },
    fetch() { return Promise.reject(new Error('not needed')); },
    R() { return { explainer: fallback }; },
    window: { LN_RULES_OVERRIDE: { explainer: [{ id: 'bad', q: { en: 'Missing German' } }] } }
  });

  assert.equal(api.explainerCards('explainer'), fallback);
});

test('clearing a request also clears the feedback correction state', () => {
  const state = {
    manualKind: true,
    manualGoal: true,
    corrected: true,
    manualAtText: 'old request',
    parts: [],
    collecting: false,
    caps: [],
    capNote: '',
    forceFull: false,
    leanPrompt: false,
    askFirst: false,
    sentPrompt: ''
  };
  const els = {
    text: { value: 'old request', focus() {} }, out: { value: '' },
    aud: { value: '' }, fmt: { value: '' }, inc: { value: '' }, avo: { value: '' },
    ctx: { value: '' }, ex: { value: '' }, improve: { checked: true }, result: { hidden: false }
  };
  const doClear = contentFunction('doClear', '\n\n  function doCopy()', {
    state,
    els,
    FIELDS: ['aud', 'fmt', 'inc', 'avo', 'ctx', 'ex'],
    redetect() {}, refresh() {}, renderFeedbackContext() {}, save() {}
  });

  doClear();

  assert.equal(state.corrected, false);
});

test('restoring history preserves its manual kind and goal as a correction', () => {
  const state = {
    history: [{
      text: 'Write a message.', aud: '', fmt: '', inc: '', avo: '', ctx: '', ex: '',
      lang: 'en', goal: 'artifact', kind: 'write', manualKind: true, manualGoal: true
    }],
    lang: 'de', goal: 'answer', manualGoal: false, manualKind: false, corrected: false, manualAtText: ''
  };
  const els = {
    text: { value: '', focus() {} }, aud: { value: '' }, fmt: { value: '' },
    inc: { value: '' }, avo: { value: '' }, ctx: { value: '' }, ex: { value: '' },
    kind: { value: 'general' }
  };
  const restoreHistory = contentFunction('restoreHistory', '\n\n  /* -------------------------------------------------------------- helpers', {
    state, els, applyLang() {}, paintGoals() {}, redetect() {}, refresh() {}, save() {}
  });

  restoreHistory(0);

  assert.equal(state.manualKind, true);
  assert.equal(state.manualGoal, true);
  assert.equal(state.corrected, true);
});

test('restoring automatic history does not turn its detected labels into corrections', () => {
  const state = {
    history: [{
      text: 'Write a clear update.', aud: '', fmt: '', inc: '', avo: '', ctx: '', ex: '',
      lang: 'en', goal: 'artifact', kind: 'write'
    }],
    lang: 'de', goal: 'answer', manualGoal: false, manualKind: false, corrected: false, manualAtText: ''
  };
  const els = {
    text: { value: '', focus() {} }, aud: { value: '' }, fmt: { value: '' },
    inc: { value: '' }, avo: { value: '' }, ctx: { value: '' }, ex: { value: '' },
    kind: { value: 'general' }
  };
  let redetected = false;
  const restoreHistory = contentFunction('restoreHistory', '\n\n  /* -------------------------------------------------------------- helpers', {
    state, els, applyLang() {}, paintGoals() {}, redetect() { redetected = true; }, refresh() {}, save() {}
  });

  restoreHistory(0);

  assert.equal(state.manualKind, false);
  assert.equal(state.manualGoal, false);
  assert.equal(state.corrected, false);
  assert.equal(redetected, true);
});
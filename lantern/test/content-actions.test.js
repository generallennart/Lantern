const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const providers = require(path.join(__dirname, '..', 'src', 'providers.js'));

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
  const values = names.map(name => dependencies[name]);
  return new Function(...names, source + '\nreturn ' + name + ';')(...values);
}

function pageLookApi(dependencies) {
  const start = contentSource.indexOf('  let pageLookRestore = null;');
  const end = contentSource.indexOf('\n\n  function syncTheme()', start);
  assert.notEqual(start, -1, 'page look state should exist');
  assert.notEqual(end, -1, 'page look helpers should end before syncTheme');
  const source = contentSource.slice(start, end);
  const names = Object.keys(dependencies);
  return new Function(...names, source + '\nreturn { syncPageLook, clearPageLook };')(
    ...names.map(name => dependencies[name])
  );
}

function panelEventShield() {
  const start = contentSource.indexOf('  const PANEL_EVENT_TYPES =');
  const end = contentSource.indexOf('\n\n  function onKey', start);
  assert.notEqual(start, -1, 'panel event shield should exist');
  assert.notEqual(end, -1, 'panel event shield should end before onKey');
  return new Function(contentSource.slice(start, end) + '\nreturn containPanelEvents;')();
}

test('clear removes all request-scoped material before saving a new draft', () => {
  let redetected = false;
  let refreshed = false;
  let saved = false;
  let focused = false;
  const state = {
    manualKind: true,
    manualGoal: true,
    manualAtText: 'old request',
    goal: 'artifact',
    modelChoice: 'deep',
    parts: ['private first part', 'private second part'],
    collecting: true,
    caps: ['web'],
    capNote: 'web',
    forceFull: true,
    leanPrompt: true,
    askFirst: true,
    improveExplicit: true
  };
  const els = {
    text: { value: 'old request', focus() { focused = true; } },
    out: { value: 'old prompt' },
    aud: { value: 'audience' },
    fmt: { value: 'format' },
    inc: { value: 'include' },
    avo: { value: 'avoid' },
    ctx: { value: 'context' },
    ex: { value: 'example' },
    scope: { checked: true },
    improve: { checked: true },
    sources: { checked: true },
    ignoreMemory: { checked: true },
    model: { value: 'deep' },
    details: { open: true },
    result: { hidden: false }
  };
  const doClear = contentFunction('doClear', '\n\n  function doCopy()', {
    state,
    els,
    FIELDS: ['aud', 'fmt', 'inc', 'avo', 'ctx', 'ex'],
    redetect() { redetected = true; },
    refresh() { refreshed = true; },
    renderFeedbackContext() {},
    save() { saved = true; }
  });

  doClear();

  assert.deepEqual(state.parts, []);
  assert.equal(state.collecting, false);
  assert.deepEqual(state.caps, []);
  assert.equal(state.capNote, '');
  assert.equal(state.forceFull, false);
  assert.equal(state.leanPrompt, false);
  assert.equal(state.askFirst, false);
  assert.equal(state.improveExplicit, false);
  assert.equal(state.modelChoice, 'auto');
  assert.equal(state.goal, 'answer');
  assert.equal(els.model.value, 'auto');
  assert.equal(els.scope.checked, false);
  assert.equal(els.improve.checked, false);
  assert.equal(els.sources.checked, false);
  assert.equal(els.ignoreMemory.checked, false);
  assert.equal(els.details.open, false);
  assert.equal(els.result.hidden, true);
  assert.equal(redetected && refreshed && saved && focused, true);
});

test('clear all is available before a prompt result exists', () => {
  const promptStart = contentSource.indexOf('<div class="ln-body" id="ln-pane-prompt"');
  const resultStart = contentSource.indexOf('<div class="ln-result"', promptStart);
  const clearAt = contentSource.indexOf('data-act="clear"', promptStart);

  assert.ok(promptStart >= 0);
  assert.ok(resultStart > promptStart);
  assert.ok(clearAt > promptStart && clearAt < resultStart);
});

test('panel text events stop at Lantern instead of reaching a host chat handler', () => {
  const listeners = {};
  const containPanelEvents = panelEventShield();
  const root = {
    addEventListener(type, listener) { listeners[type] = listener; }
  };

  containPanelEvents(root);

  ['keydown', 'beforeinput', 'input', 'compositionend', 'paste', 'focusin'].forEach(type => {
    let stopped = false;
    listeners[type]({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true, type);
  });
});

test('refresh rebuilds an already visible prompt without requiring another build click', () => {
  let automatic = false;
  const refresh = contentFunction('refresh', '\n\n  /* What the five tabs', {
    collect() { return { text: 'Make a tier list.' }; },
    state: {},
    E: {
      route() { return {}; },
      assessUse() { return {}; },
      extract() { return {}; }
    },
    renderRouting() {},
    renderModel() {},
    renderFound() {},
    renderParts() {},
    renderChecklist() {},
    renderExamples() {},
    renderDetailCount() {},
    renderSelfCheck() {},
    els: { help: { hidden: true }, result: { hidden: false } },
    doBuild(value) { automatic = value; }
  });

  refresh();

  assert.equal(automatic, true);
});

test('ChatGPT model names use neutral prompt framing until their differences are verified', () => {
  ['astra', 'astrum', 'sol', 'terra', 'luna'].forEach(model => {
    const currentTier = contentFunction('currentTier', '\n\n  /* Anthropic publishes', {
      state: { provider: { id: 'chatgpt' }, modelChoice: 'auto', model },
      PROV: { tierOf() { return 'fast'; } },
      E: { tierOf() { return 'fast'; } }
    });

    assert.equal(currentTier(), 'balanced', model);
  });
});

test('ChatGPT model notes do not make unverified tier claims', () => {
  ['astra', 'astrum', 'sol', 'terra', 'luna'].forEach(model => {
    let usedTierCopy = false;
    const els = { modelNote: { textContent: '', dataset: {}, hidden: true } };
    const renderModel = contentFunction('renderModel', '\n\n  /* --------------------------------------------------- reading', {
      state: { provider: { id: 'chatgpt', costlyEfforts: [] }, modelChoice: 'auto', model, lang: 'en' },
      currentTier() { return 'balanced'; },
      modelDisplayName() { return model; },
      R() { return { modelTiers: [{ id: 'balanced', label: { en: 'Balanced' } }] }; },
      t() {
        return {
          modelNeutral(name) { return 'Neutral framing for ' + name + '.'; },
          modelFor() { usedTierCopy = true; return 'Tier claim'; },
          modelUnknown: 'Unknown',
          modelDeepHint: 'Deep hint',
          effortCostly: 'Costly {e}'
        };
      },
      detectEffort() { return null; },
      cap(value) { return value; },
      tierLabel() { return 'Balanced'; },
      els
    });

    renderModel();

    assert.equal(usedTierCopy, false, model);
    assert.equal(els.modelNote.textContent, 'Neutral framing for ' + model + '.', model);
    assert.equal(els.modelNote.dataset.tier, 'balanced', model);
    assert.equal(els.modelNote.hidden, false, model);
  });
});

test('panel tabs support roving keyboard navigation', () => {
  const focused = [];
  const tabs = ['prompt', 'follow', 'move', 'later'].map(id => ({
    dataset: { tab: id },
    focus() { focused.push(id); },
    closest() { return this; }
  }));
  const calls = [];
  const onTabKeys = contentFunction('onTabKeys', '\n\n  function setTab', {
    panel: { querySelectorAll() { return tabs; } },
    setTab(name) { calls.push(name); },
    Array
  });
  let prevented = false;

  onTabKeys({ key: 'ArrowRight', target: tabs[0], preventDefault() { prevented = true; } });
  onTabKeys({ key: 'End', target: tabs[1], preventDefault() {} });

  assert.equal(prevented, true);
  assert.deepEqual(calls, ['follow', 'later']);
  assert.deepEqual(focused, ['follow', 'later']);
});

test('unavailable capability chips communicate their unavailable state', () => {
  const chips = [];
  const renderCaps = contentFunction('renderCaps', '\n\n  function renderCapsNote', {
    els: {
      caps: {
        textContent: '',
        appendChild(node) { chips.push(node); }
      },
      capsNote: { hidden: false }
    },
    state: { caps: [] },
    capsFor() { return [{ id: 'image', label: 'Image', how: 'none', note: 'Unavailable here' }]; },
    renderCapsNote() {},
    document: {
      createElement() {
        return {
          dataset: {},
          classList: { toggle() {}, add() {} },
          setAttribute(name, value) { this[name] = String(value); }
        };
      }
    }
  });

  renderCaps();

  assert.equal(chips[0]['aria-disabled'], 'true');
  assert.equal(chips[0].title, 'Unavailable here');
});

test('generic model picker discovery ignores navigation and conversation controls', () => {
  const sidebarTitle = {
    getAttribute(name) { return name === 'aria-haspopup' ? 'menu' : ''; },
    innerText: 'Terra forming a garden plan',
    closest(selector) { return selector.indexOf('nav') !== -1 ? {} : null; }
  };
  const picker = {
    getAttribute(name) { return name === 'aria-haspopup' ? 'menu' : ''; },
    innerText: 'Terra',
    closest() { return null; }
  };
  const pickerCandidates = contentFunction('pickerCandidates', '\n\n  /* ChatGPT\'s switcher', {
    state: { provider: { dom: { modelPicker: [] } } },
    document: {
      querySelectorAll(selector) {
        if (selector === '[data-testid*="model"]') return [sidebarTitle];
        return selector.indexOf('aria-haspopup') !== -1 ? [sidebarTitle, picker] : [];
      }
    },
    Set
  });

  assert.deepEqual(pickerCandidates().map(candidate => candidate.el), [picker]);
});

test('generic model picker discovery bounds page-wide candidate reads', () => {
  let reads = 0;
  const controls = Array.from({ length: 100 }, () => ({
    getAttribute(name) { return name === 'aria-haspopup' ? 'menu' : ''; },
    get innerText() { reads++; return 'Menu'; },
    closest() { return null; }
  }));
  const pickerCandidates = contentFunction('pickerCandidates', '\n\n  /* ChatGPT\'s switcher', {
    state: { provider: { dom: { modelPicker: [] } } },
    document: {
      querySelectorAll(selector) {
        return selector.indexOf('aria-haspopup') !== -1 ? controls : [];
      }
    },
    Set
  });

  pickerCandidates();

  assert.ok(reads <= 48, 'generic candidate reads: ' + reads);
});

test('automatic prompt refresh labels the result mode it now reflects', () => {
  let shown = null;
  const doBuild = contentFunction('doBuild', '\n\n  /* Where a new chat lives', {
    collect() { return { text: 'Make a tier list.', goal: 'artifact' }; },
    E: {
      buildPrompt() {
        return { prompt: 'Make a tier list.', vague: false, asIs: false, why: 'makeSomething', adapted: [] };
      }
    },
    R() { return { goals: [{ id: 'artifact', short: { en: 'A finished thing' } }] }; },
    showResult(...args) { shown = args; },
    renderAdapted() {},
    renderVerdict() {},
    state: { lang: 'en' },
    t() {
      return {
        detailNote: 'Lantern built a prompt.',
        autoUpdated(goal) { return 'Updated automatically for: ' + goal + '.'; }
      };
    },
    announce() {},
    els: { result: { scrollIntoView() {} } },
    motion() { return 'auto'; },
    pushHistory() {},
    recordRun() {},
    save() {}
  });

  doBuild(true);

  assert.deepEqual(shown, [
    'Make a tier list.',
    'Lantern built a prompt.',
    'ok',
    'Updated automatically for: A finished thing.'
  ]);
});

test('an unchanged answer still refreshes the page layer after host DOM changes', () => {
  let refreshed = 0;
  const onAnswerChanged = contentFunction('onAnswerChanged', '\n\n  /* ------------------------------------------------------------------ ui', {
    dropScans() {},
    noticeChatSwitch() {},
    detectModel() { return null; },
    state: { model: null },
    els: { modelNote: null },
    lastAnswerText() { return 'same answer'; },
    userTurns() { return 0; },
    lastAnswerKey: '11|same answer|0',
    refreshPage() { refreshed++; }
  });

  onAnswerChanged();

  assert.equal(refreshed, 1);
});

test('handover collection ignores a code block from before the request', () => {
  let saved = false;
  let rendered = false;
  const state = {
    mvWaiting: Date.now(),
    mvBefore: 'existing answer with a code block',
    capturing: false,
    handover: ''
  };
  const tryHandoverCollect = contentFunction(
    'tryHandoverCollect',
    '\n\n  function doHandoverCollect()',
    {
      state,
      lastAnswerText() { return 'existing answer with a code block'; },
      lastAnswerCode() { return 'x'.repeat(80); },
      els: { mvOut: { value: '' } },
      saveHandover() { saved = true; },
      renderMove() { rendered = true; },
      panel: { hidden: false },
      open() {},
      setTab() {},
      toast() {},
      t() { return { mvGot: 'Captured' }; }
    }
  );

  tryHandoverCollect();

  assert.equal(state.handover, '');
  assert.equal(saved, false);
  assert.equal(rendered, false);
});

test('starting a moved chat carries the handover for automatic composer insertion', () => {
  const calls = [];
  const state = { handover: '', lang: 'en' };
  const els = { mvOut: { value: 'Collected handover' }, mvNext: { value: 'Draft the client update.' } };
  const doHandoverLaunch = contentFunction(
    'doHandoverLaunch',
    '\n\n  function saveHandover()',
    {
      state,
      els,
      saveHandover() { calls.push('save'); },
      E: { buildHandoverLaunch(handover, options) { return handover + ' / ' + options.next; } },
      openChat(...args) { calls.push(args); },
      writeClipboard() { calls.push('copy'); }
    }
  );

  doHandoverLaunch();

  assert.equal(state.handover, 'Collected handover');
  assert.deepEqual(calls, ['save', ['Collected handover / Draft the client update.', false, 'open', true]]);
});

test('handoff waits for carry storage before navigating the new tab', () => {
  let afterWrite;
  let navigatedTo = '';
  const opened = [];
  const newTab = {
    closed: false,
    location: {
      replace(url) { navigatedTo = url; }
    }
  };
  const openChat = contentFunction('openChat', '\n\n  function doRefine()', {
    state: { provider: { id: 'claude', prefillSupported: false, newChat: base => base + 'new' }, lang: 'en' },
    chatBase() { return 'https://claude.ai/'; },
    STORE: { set(_value, callback) { afterWrite = callback; } },
    Date,
    window: {
      open(url, target) {
        opened.push({ url, target });
        return newTab;
      }
    },
    chrome: { runtime: { sendMessage() {} } }
  });

  openChat('private handoff text', false, 'open');

  assert.deepEqual(opened, [{ url: '', target: '_blank' }]);
  assert.equal(navigatedTo, '');
  afterWrite();
  assert.equal(navigatedTo, 'https://claude.ai/new#ln=open');
});

test('automatic handover carry inserts once without opening or sending a panel result', () => {
  const calls = [];
  const state = { carry: 'Continue from this handover.', carryAutoInsert: true };
  const autoInsertCarry = contentFunction('autoInsertCarry', '\n\n  function doRefine()', {
    state,
    insertIntoComposer(text) { calls.push(['insert', text]); return true; },
    STORE: { remove(key) { calls.push(['remove', key]); } },
    toast(text) { calls.push(['toast', text]); },
    t() { return { handoverInserted: 'Ready to send' }; },
    setTimeout() { calls.push(['retry']); },
    open() { calls.push(['open']); },
    showResult() { calls.push(['result']); },
    els: { intro: {}, result: { scrollIntoView() { calls.push(['scroll']); } } }
  });

  autoInsertCarry();

  assert.deepEqual(calls, [
    ['insert', 'Continue from this handover.'],
    ['remove', 'lnCarry'],
    ['toast', 'Ready to send']
  ]);
  assert.equal(state.carry, '');
  assert.equal(state.carryAutoInsert, false);
});

test('sharpen handoff writes its capture marker with the carry before navigation', () => {
  let afterWrite;
  let stored;
  let navigatedTo = '';
  const newTab = {
    closed: false,
    location: { replace(url) { navigatedTo = url; } }
  };
  const openChat = contentFunction('openChat', '\n\n  function doRefine()', {
    state: { provider: providers.byId('chatgpt'), lang: 'en' },
    chatBase() { return 'https://chatgpt.com/'; },
    STORE: { set(value, callback) { stored = value; afterWrite = callback; } },
    Date,
    window: { open() { return newTab; } },
    chrome: { runtime: { sendMessage() {} } }
  });

  openChat('meta prompt', true, 'sharpen');

  assert.equal(stored.lnCarry.text, 'meta prompt');
  assert.equal(stored.lnCarry.lang, 'en');
  assert.equal(stored.lnSharpen.lang, 'en');
  assert.equal(navigatedTo, '');
  afterWrite();
  assert.equal(navigatedTo, 'https://chatgpt.com/?temporary-chat=true#ln=sharpen');
  assert.equal(navigatedTo.includes('meta prompt'), false);
});

test('sharpening fills the current composer and waits for a new answer', () => {
  const calls = [];
  const state = {};
  const doRefine = contentFunction('doRefine', '\n\n  /* Lift the sharpened prompt', {
    collect() { return { text: 'Build a playlist.' }; },
    E: { buildMetaPrompt() { return 'META_PROMPT'; } },
    lastAnswerText() { return 'Earlier answer'; },
    insertIntoComposer(text) { calls.push(['insert', text]); return true; },
    state,
    toast(text) { calls.push(['toast', text]); },
    t() { return { refineReady: 'Ready to send', clipboardFallback: 'Copied' }; },
    setTimeout(fn, wait) { calls.push(['wait', wait]); fn(); return 0; },
    close() { calls.push(['close']); },
    writeClipboard() { calls.push(['copy']); },
    pushHistory(value) { calls.push(['history', value.text]); },
    recordRun(_value, kind) { calls.push(['run', kind]); },
    save() {}
  });

  doRefine();

  assert.deepEqual(calls, [
    ['insert', 'META_PROMPT'],
    ['toast', 'Ready to send'],
    ['wait', 300],
    ['close'],
    ['history', 'Build a playlist.'],
    ['run', 'sharpened']
  ]);
  assert.equal(state.capturing, true);
  assert.equal(state.sharpenBefore, 'Earlier answer');
  assert.equal(typeof state.sharpenStarted, 'number');
});

test('sharpen capture ignores a code block from before the request', () => {
  let shown = false;
  const state = { capturing: true, sharpenBefore: 'Earlier answer', sharpenStarted: Date.now() };
  const tryCapture = contentFunction('tryCapture', '\n\n  function doGrab()', {
    state,
    Date,
    lastAnswerText() { return 'Earlier answer'; },
    lastAnswerCode() { return 'x'.repeat(80); },
    STORE: { remove() {} },
    showResult() { shown = true; },
    t() { return { sharpenGot: 'Captured' }; },
    panel: { hidden: false },
    open() {},
    setTab() {},
    els: { intro: {}, result: { scrollIntoView() {} } },
    toast() {}
  });

  assert.equal(tryCapture(), false);
  assert.equal(state.capturing, true);
  assert.equal(shown, false);
});

test('sharpen capture rejects a model result that drops source details', () => {
  const source = 'Ich bin morgen krank, nicht wirklich krank genug um gerechtfertigt zuhause zu bleiben, aber mir geht es so am besten.';
  const shown = [];
  const state = {
    capturing: true,
    sharpenBefore: 'Earlier answer',
    sharpenStarted: Date.now(),
    sharpenSource: source
  };
  const tryCapture = contentFunction('tryCapture', '\n\n  function doGrab()', {
    state,
    Date,
    lastAnswerText() { return 'New answer'; },
    lastAnswerCode() { return 'Schreibe eine E-Mail an meinen Chef, dass ich morgen krank bin.'; },
    sharpenedPreservesSource(code, rough) { return code.includes(rough); },
    STORE: { remove() {} },
    showResult(...args) { shown.push(args); },
    t() { return { sharpenLossy: 'Source details were not preserved.' }; },
    panel: { hidden: false },
    open() {},
    setTab() {},
    els: { intro: {}, result: { scrollIntoView() {} } },
    toast() {}
  });

  assert.equal(tryCapture(), true);
  assert.deepEqual(shown, [[source, 'Source details were not preserved.', 'ask']]);
  assert.equal(state.capturing, false);
  assert.equal(state.sharpenSource, '');
});

test('sharpen fidelity permits harmless whitespace but rejects lost qualifiers', () => {
  const preserves = contentFunction('sharpenedPreservesSource', '\n\n  function writableComposer', {});
  const source = 'Ich bin morgen krank, nicht wirklich krank genug um zuhause zu bleiben.';

  assert.equal(preserves('TASK\n<user_request>Ich bin morgen krank, nicht wirklich krank genug um zuhause zu bleiben.</user_request>', source), true);
  assert.equal(preserves('Schreibe eine E-Mail, dass ich morgen krank bin.', source), false);
});

test('follow-up directs custom feedback to the real chat input without relaying text', () => {
  const calls = [];
  const editor = { focus(options) { calls.push(['focus', options]); } };
  const focusComposer = contentFunction('focusComposer', '\n\n  function repeatTaskContext()', {
    composer() { return editor; },
    toast(text) { calls.push(['toast', text]); },
    t() { return { composerFocusUnavailable: 'Missing' }; },
    close() { calls.push(['close']); }
  });

  focusComposer();

  assert.deepEqual(calls, [['focus', { preventScroll: true }], ['close']]);
});

test('the prompt panel has no example-prompt shelf or click route', () => {
  assert.doesNotMatch(contentSource, /ln-examples|ln-example-list|data-example|examplesFor/);
});

test('repeating task context requires an explicit action after a prompt was inserted', () => {
  const calls = [];
  const repeatTaskContext = contentFunction('repeatTaskContext', '\n\n  /* How much the length', {
    state: { sentPrompt: 'FULL ORIGINAL TASK' },
    insertIntoComposer(text) { calls.push(['insert', text]); return true; },
    toast(text) { calls.push(['toast', text]); },
    t() { return { contextRepeated: 'Repeated', clipboardFallback: 'Copied' }; },
    setTimeout(fn, wait) { calls.push(['wait', wait]); fn(); return 0; },
    close() { calls.push(['close']); },
    writeClipboard() { calls.push(['copy']); }
  });

  repeatTaskContext();

  assert.deepEqual(calls, [
    ['insert', 'FULL ORIGINAL TASK'],
    ['toast', 'Repeated'],
    ['wait', 500],
    ['close']
  ]);
});

test('handoff uses its opened tab even when clearing window.opener fails', () => {
  let navigatedTo = '';
  let openedFallback = false;
  const newTab = {
    closed: false,
    location: { replace(url) { navigatedTo = url; } }
  };
  Object.defineProperty(newTab, 'opener', { set() { throw new Error('opener is read-only'); } });
  const openChat = contentFunction('openChat', '\n\n  function doRefine()', {
    state: { provider: { id: 'claude', prefillSupported: false, newChat: base => base + 'new' }, lang: 'en' },
    chatBase() { return 'https://claude.ai/'; },
    STORE: { set(_value, callback) { callback(); } },
    Date,
    window: { open() { return newTab; } },
    chrome: { runtime: { sendMessage() { openedFallback = true; } } }
  });

  openChat('private handoff text', false, 'open');

  assert.equal(navigatedTo, 'https://claude.ai/new#ln=open');
  assert.equal(openedFallback, false);
});

test('applying a saved panel box never overflows a narrow viewport', () => {
  const panel = { style: {} };
  let placed = false;
  const applyBox = contentFunction('applyBox', '\n\n  function currentBox()', {
    panel,
    window: { innerWidth: 300, innerHeight: 220 },
    MIN_W: 320,
    MIN_H: 260,
    placeFab() { placed = true; }
  });

  applyBox({ w: 412, h: 500 });

  assert.equal(panel.style.width, '284px');
  assert.equal(panel.style.height, '204px');
  assert.equal(panel.style.left, '8px');
  assert.equal(panel.style.top, '8px');
  assert.equal(placed, true);
});

test('the default panel width leaves room for dense follow-up controls', () => {
  const panel = { style: {} };
  const applyBox = contentFunction('applyBox', '\n\n  function currentBox()', {
    panel,
    window: { innerWidth: 1200, innerHeight: 800 },
    MIN_W: 320,
    MIN_H: 260,
    placeFab() {}
  });

  applyBox({});

  assert.equal(panel.style.width, '468px');
});

test('self-check redacts unsafe named picker text before it enters a report', () => {
  const withheld = '(withheld: looked like account data)';
  const selfCheckFacts = contentFunction(
    'selfCheckFacts',
    '\n\n  /* Two things about this that',
    {
      state: {
        provider: {
          label: 'Test provider',
          dom: { assistant: '.assistant', user: '.user', message: '.message' },
          tiers: []
        },
        answer: { present: false, words: 0, signals: [] },
        lastAdapted: [],
        model: null,
        modelLabel: null,
        wakes: 0,
        reads: 0
      },
      document: { querySelectorAll() { return []; } },
      safeForReport(text) {
        return String(text).includes('@') ? withheld : String(text);
      },
      safeReportExcerpt(text, limit) {
        const safe = String(text).includes('@') ? withheld : String(text);
        return safe ? safe.slice(0, limit) : null;
      },
      pickerCandidates() {
        return [{ named: true, both: 'Model alice@example.com', el: {} }];
      },
      aroundPicker() { return ''; },
      sel() { return '.assistant'; },
      composer() { return null; },
      cap(text) { return String(text); },
      detectEffort() { return null; },
      detectLimit() { return null; },
      findOutsideMessages() { return null; },
      STORE: { alive() { return true; } },
      window: { LN_INPAGE: { isOn() { return false; } } },
      driftFacts() { return {}; },
      panel: {}
    }
  );

  const facts = selfCheckFacts();

  assert.deepEqual(facts.namedPickers, [withheld]);
});

test('storage reset clears an open panel back to its default in-memory state', () => {
  const calls = [];
  const state = {
    lang: 'de',
    manualLang: true,
    manualKind: true,
    manualGoal: true,
    manualAtText: 'old request',
    box: { left: 40, top: 40, w: 500, h: 600 },
    settingsRaw: { accent: 'blue' },
    modelChoice: 'opus',
    introSeen: true,
    history: [{ text: 'old request' }],
    parts: ['private material'],
    queue: [{ text: 'private queue item' }],
    collecting: true,
    caps: ['web'],
    capNote: 'web',
    forceFull: true,
    leanPrompt: true,
    askFirst: true,
    statusOn: true,
    status: { ok: true },
    textSize: 'riesig',
    accent: 'blue',
    tennis: true,
    handover: 'private handover',
    lastAdapted: [{ id: 'anchor' }],
    carry: 'private carry',
    capturing: true,
    mvWaiting: Date.now(),
    mvBefore: 'old answer',
    mvParts: ['all']
  };
  const els = {
    text: { value: 'old request' },
    out: { value: 'old prompt' },
    aud: { value: 'old audience' },
    fmt: { value: 'old format' },
    inc: { value: 'old include' },
    avo: { value: 'old avoid' },
    ctx: { value: 'old context' },
    ex: { value: 'old example' },
    result: { hidden: false },
    mvOut: { value: 'old handover' },
    mvNext: { value: 'old next step' },
    details: { open: true },
    status: { hidden: false }
  };
  const panel = {
    hidden: false,
    style: { left: '40px', top: '40px', width: '500px', height: '600px', right: 'auto', bottom: 'auto' }
  };
  const resetStoredState = contentFunction('resetStoredState', '\n\n  function restore()', {
    state,
    els,
    panel,
    navigator: { language: 'en-US' },
    FIELDS: ['aud', 'fmt', 'inc', 'avo', 'ctx', 'ex'],
    applyLook() { calls.push('look'); },
    applyLang() { calls.push('language'); },
    redetect() { calls.push('detect'); },
    renderHistory() { calls.push('history'); },
    renderQueue() { calls.push('queue'); },
    renderMove() { calls.push('move'); },
    refresh() { calls.push('refresh'); },
    updateBadge() { calls.push('badge'); },
    renderIntroTabs() { calls.push('intro'); },
    enablePage() { calls.push('page'); },
    placeFab() { calls.push('fab'); },
    stopSelfCheck() { calls.push('selfcheck'); }
  });

  resetStoredState();

  assert.equal(state.lang, 'en');
  assert.equal(state.pageLayer, true);
  assert.equal(state.modelChoice, 'auto');
  assert.equal(state.textSize, 'normal');
  assert.equal(state.accent, 'green');
  assert.deepEqual(state.history, []);
  assert.deepEqual(state.parts, []);
  assert.deepEqual(state.queue, []);
  assert.equal(state.handover, '');
  assert.equal(state.capturing, false);
  assert.equal(state.improveExplicit, false);
  assert.equal(state.mvWaiting, 0);
  assert.equal(els.text.value, '');
  assert.equal(els.result.hidden, true);
  assert.equal(els.mvOut.value, '');
  assert.equal(els.details.open, false);
  assert.equal(els.status.hidden, true);
  assert.equal(panel.style.left, '');
  assert.equal(panel.style.width, '');
  assert.deepEqual(calls, ['selfcheck', 'look', 'language', 'detect', 'history', 'queue', 'move', 'refresh', 'badge', 'intro', 'page', 'fab']);
});

test('look settings retain usable in-page accent colors when stylesheet variables are unavailable', () => {
  const root = {
    style: { setProperty() {} },
    setAttribute() {},
    removeAttribute() {}
  };
  const applyLook = contentFunction('applyLook', '\n\n  function syncTheme()', {
    root,
    state: { textSize: 'normal', accent: 'green' },
    TEXT_SIZES: { normal: 14 },
    ACCENTS: ['green'],
    getComputedStyle() {
      return { getPropertyValue() { return ''; } };
    },
    syncPageLook() {},
    window: { LN_INPAGE: { isOn() { return true; } } },
    placeFab() {}
  });

  applyLook();
});

test('panel settings persist a smaller text choice and reject unknown sizes', () => {
  const calls = [];
  const state = { textSize: 'normal' };
  const setTextSize = contentFunction('setTextSize', '\n\n  function setAccent', {
    TEXT_SIZES: { small: 14, normal: 16 },
    state,
    applyLook() { calls.push('look'); },
    savePanelSettings() { calls.push('save'); }
  });

  setTextSize('small');
  setTextSize('unknown');

  assert.equal(state.textSize, 'small');
  assert.deepEqual(calls, ['look', 'save']);
});

test('in-page accent variables are restored exactly when Lantern closes', () => {
  const values = {
    '--ln-accent': { value: '#123456', priority: 'important' },
    '--ln-accent-fg': { value: '#abcdef', priority: '' }
  };
  const style = {
    getPropertyValue(name) { return values[name] ? values[name].value : ''; },
    getPropertyPriority(name) { return values[name] ? values[name].priority : ''; },
    setProperty(name, value, priority) { values[name] = { value, priority: priority || '' }; },
    removeProperty(name) { delete values[name]; }
  };
  const api = pageLookApi({
    root: {},
    document: { documentElement: { style } },
    getComputedStyle() {
      return {
        getPropertyValue(name) {
          return name === '--accent' ? '#0f7a5a' : '#ffffff';
        }
      };
    }
  });

  api.syncPageLook();
  assert.deepEqual(values['--ln-accent'], { value: '#0f7a5a', priority: '' });
  assert.deepEqual(values['--ln-accent-fg'], { value: '#ffffff', priority: '' });
  api.clearPageLook();

  assert.deepEqual(values['--ln-accent'], { value: '#123456', priority: 'important' });
  assert.deepEqual(values['--ln-accent-fg'], { value: '#abcdef', priority: '' });
});

test('language changes keep the visible intro and live announcements accessible', () => {
  const applyStart = contentSource.indexOf('  function applyLang() {');
  const applyEnd = contentSource.indexOf('\n\n  /* -------------------------------------------------------------- actions', applyStart);
  const introStart = contentSource.indexOf('  function renderIntroTabs() {');
  const introEnd = contentSource.indexOf('\n\n  function renderExamples()', introStart);
  assert.match(contentSource.slice(applyStart, applyEnd), /root\.setAttribute\('lang', state\.lang\)/);
  assert.match(contentSource.slice(applyStart, applyEnd), /if \(els\.intro && !els\.intro\.hidden\) renderIntroTabs\(\);/);
  assert.match(contentSource.slice(introStart, introEnd), /document\.createTextNode\(' - ' \+ \(what \|\| ''\)\)/);
  assert.match(contentSource, /root\.appendChild\(els\.announce\);/);
});

test('browser resize refreshes the in-page layout reservation', () => {
  let onResize;
  let placed = false;
  let refreshed = false;
  const wireDrag = contentFunction('wireDrag', '\n\n  /* ---------------------------------------------------------------- later', {
    panel: {
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    window: {
      addEventListener(type, listener) {
        if (type === 'resize') onResize = listener;
      }
    },
    state: { box: null },
    startDrag() {},
    applyBox() {},
    placeFab() { placed = true; },
    refreshPage() { refreshed = true; }
  });

  wireDrag();
  onResize();

  assert.equal(placed, true);
  assert.equal(refreshed, true);
});

test('dragging captures its pointer and cleans up on cancellation', () => {
  const listeners = {};
  const removed = [];
  const target = {
    setPointerCapture(pointerId) { this.captured = pointerId; },
    releasePointerCapture(pointerId) { this.released = pointerId; },
    addEventListener(type, listener) { listeners[type] = listener; },
    removeEventListener(type) { removed.push(type); }
  };
  const panel = { dataset: {} };
  let saved = 0;
  const applied = [];
  const startDrag = contentFunction('startDrag', '\n\n  function wireDrag()', {
    panel,
    currentBox() { return { left: 20, top: 20, w: 400, h: 500 }; },
    applyBox(box) { applied.push(box); },
    MIN_W: 320,
    MIN_H: 260,
    window: { addEventListener() {}, removeEventListener() {} },
    saveBox() { saved++; },
    refreshPage() {}
  });

  startDrag({ button: 0, pointerId: 7, clientX: 100, clientY: 100, currentTarget: target }, 'move');

  assert.equal(target.captured, 7);
  assert.equal(typeof listeners.pointermove, 'function');
  assert.equal(typeof listeners.pointerup, 'function');
  assert.equal(typeof listeners.pointercancel, 'function');
  assert.equal(typeof listeners.lostpointercapture, 'function');

  listeners.pointermove({ pointerId: 7, clientX: 130, clientY: 140, preventDefault() {} });
  assert.deepEqual(applied.at(-1), { left: 50, top: 60, w: 400, h: 500 });

  listeners.pointercancel({});

  assert.equal(panel.dataset.dragging, '');
  assert.equal(target.released, 7);
  assert.equal(saved, 1);
  assert.deepEqual(removed.sort(), ['lostpointercapture', 'pointercancel', 'pointermove', 'pointerup']);
});

test('saving panel settings updates the cached settings used by a later drag save', () => {
  let settingWrite;
  let boxWrite;
  let finishSettingsRead;
  const state = {
    settingsRaw: { temporaryChat: false, accent: 'blue' },
    introSeen: true,
    tennis: true,
    box: null
  };
  const saveSettings = contentFunction('saveSettings', '\n\n  function resetStoredState()', {
    state,
    chrome: {
      storage: {
        local: {
          get(_keys, callback) {
            finishSettingsRead = () => callback({ lnSettings: { temporaryChat: false, accent: 'blue' } });
          }
        }
      }
    },
    STORE: { set(value) { settingWrite = value; } }
  });
  const saveBox = contentFunction('saveBox', '\n\n  function startDrag(e, mode)', {
    state,
    panel: { hidden: false },
    currentBox() { return { left: 20, top: 20, w: 400, h: 500 }; },
    STORE: { set(value) { boxWrite = value; } }
  });

  saveSettings();
  saveBox();

  assert.equal(finishSettingsRead, undefined);
  assert.equal(state.settingsRaw.tennis, true);
  assert.equal(boxWrite.lnSettings.tennis, true);
  assert.deepEqual(boxWrite.lnSettings.box, { left: 20, top: 20, w: 400, h: 500 });
});

test('comparison links refuse unsafe URLs supplied by a remote rules file', () => {
  const anchor = { className: '', href: '', target: '', rel: '', textContent: '' };
  const vendorLink = contentFunction('vendorLink', '\n\n  /* Which cards the reader has opened.', {
    document: { createElement() { return anchor; } },
    trustedVendorUrl() { return ''; }
  });

  const result = vendorLink({ name: 'Unsafe vendor', url: 'javascript:alert(1)' });

  assert.equal(result, anchor);
  assert.equal(anchor.href, '');
  assert.equal(anchor.target, '');
  assert.equal(anchor.rel, '');
});

test('comparison vendor links keep the bundled official origin', () => {
  const trustedVendorUrl = contentFunction('trustedVendorUrl', '\n\n  function vendorLink', {
    window: {
      LN_RULES: {
        compare: { vendors: [{ id: 'chatgpt', url: 'https://chatgpt.com/' }] }
      }
    },
    safeExternalUrl(raw) { return String(raw).startsWith('https://') ? raw : ''; }
  });

  assert.equal(trustedVendorUrl({ id: 'chatgpt', url: 'https://signin.example.test/' }), 'https://chatgpt.com/');
  assert.equal(trustedVendorUrl({ id: 'unknown', url: 'https://signin.example.test/' }), '');
});

test('a changed remote rules override is adopted by an already-open panel', () => {
  const window = { LN_RULES_OVERRIDE: { version: 'old' } };
  const setRulesOverride = contentFunction('setRulesOverride', '\n\n  function restore()', {
    window
  });
  const override = { version: '9.9.9', archetypes: [{ id: 'write' }], goals: [{ id: 'artifact' }] };

  assert.equal(setRulesOverride(override), true);
  assert.equal(window.LN_RULES_OVERRIDE, override);
  assert.equal(setRulesOverride({ version: 'bad', archetypes: [{}], goals: [{}] }), false);
  assert.equal(setRulesOverride(undefined), false);
  assert.equal('LN_RULES_OVERRIDE' in window, false);
});

test('a malformed hosted rules version is never applied to the panel', () => {
  const window = {};
  const setRulesOverride = contentFunction('setRulesOverride', '\n\n  function resetStoredState', { window });

  assert.equal(setRulesOverride({ version: '999999.0.0', archetypes: [{ id: 'write' }], goals: [{ id: 'artifact' }] }), false);
  assert.equal(setRulesOverride({ version: 1, archetypes: [{ id: 'write' }], goals: [{ id: 'artifact' }] }), false);
  assert.equal('LN_RULES_OVERRIDE' in window, false);
});

test('restore validates stored hosted rules before applying them', () => {
  let restored = null;
  const source = contentSource.slice(
    contentSource.indexOf('  function restore() {'),
    contentSource.indexOf('\n\n  /* A self-test', contentSource.indexOf('  function restore() {'))
  );
  const restore = new Function('STORE', 'setRulesOverride', 'showDetached', 'els', 'window', source + '\nreturn restore;')(
    { onFail() {}, load(callback) { callback({ lnRulesOverride: { version: '999999.0.0' }, lnDraft: {}, lnSettings: {} }); } },
    value => { restored = value; throw new Error('stop after validation'); },
    () => {},
    { text: {}, aud: {}, fmt: {}, inc: {}, avo: {}, ctx: {}, ex: {}, scope: {}, model: {}, improve: {}, sources: {}, ignoreMemory: {} },
    {}
  );

  try { restore(); } catch (e) {}

  assert.deepEqual(restored, { version: '999999.0.0' });
});

test('a failed provider status refresh clears an older incident warning', () => {
  let rendered = false;
  const state = {
    statusOn: true,
    status: { ok: true, healthy: false, description: 'Old incident' },
    provider: { status: { url: 'https://status.example/api' } }
  };
  const checkStatus = contentFunction('checkStatus', '\n\n  function renderStatus()', {
    state,
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(_message, callback) { callback(null); }
      }
    },
    renderStatus() { rendered = true; }
  });

  checkStatus();

  assert.equal(state.status, null);
  assert.equal(rendered, true);
});

test('the attached panel tab hides when a narrow viewport would clip it', () => {
  const fab = { hidden: false, dataset: {}, style: {}, offsetHeight: 108, offsetWidth: 26 };
  const panel = {
    hidden: false,
    getBoundingClientRect() { return { left: 8, top: 8 }; }
  };
  const placeFab = contentFunction('placeFab', '\n\n  function open()', {
    fab,
    panel,
    window: { innerWidth: 360, innerHeight: 760 }
  });

  placeFab();

  assert.equal(fab.hidden, true);
});

test('answer observation includes text-node mutations used by streamed replies', () => {
  let observedOptions;
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; }
    observe(_target, options) { observedOptions = options; }
  }
  const watchAnswers = contentFunction('watchAnswers', '\n\n  function aboutTheAnswer', {
    document: { body: {} },
    MutationObserver: FakeMutationObserver,
    aboutTheAnswer() { return false; },
    state: {},
    clearTimeout() {},
    setTimeout() { return 0; },
    onAnswerChanged() {}
  });

  watchAnswers();

  assert.equal(observedOptions.characterData, true);
});

test('insertion writes directly to a textarea composer without sending', () => {
  const events = [];
  const textarea = {
    tagName: 'TEXTAREA',
    value: 'Existing draft',
    focus() {},
    dispatchEvent(event) { events.push(event.type); return true; }
  };
  const insertIntoComposer = contentFunction('insertIntoComposer', '\n\n  /* Put the handle', {
    composer() { return textarea; },
    composerText(element) { return element.value; },
    window: {},
    document: { execCommand() { return false; } },
    DataTransfer: class {},
    ClipboardEvent: class {},
    Event: class { constructor(type) { this.type = type; } }
  });

  const inserted = insertIntoComposer('New prompt');

  assert.equal(inserted, true);
  assert.equal(textarea.value, 'Existing draft\n\nNew prompt');
  assert.deepEqual(events, ['input']);
});

test('a failed activity-counter read does not overwrite existing counters', () => {
  let writes = 0;
  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(_keys, callback) {
          chrome.runtime.lastError = { message: 'storage unavailable' };
          callback({ lnStats: { built: 12 } });
          chrome.runtime.lastError = null;
        }
      }
    }
  };
  const bumpStats = contentFunction('bumpStats', '\n\n  function recordRun', {
    chrome,
    STORE: { set() { writes++; } },
    Date
  });

  bumpStats(stats => { stats.built++; });

  assert.equal(writes, 0);
});

test('an unchanged request receives a no-change result note instead of a prompt-built note', () => {
  let shown = null;
  const doBuild = contentFunction('doBuild', '\n\n  /* Where a new chat lives', {
    collect() { return { text: 'Write a haiku about rain.' }; },
    E: {
      buildPrompt() {
        return { prompt: 'Write a haiku about rain.', vague: false, asIs: true, why: 'clearRequest', adapted: [] };
      }
    },
    showResult(...args) { shown = args; },
    renderAdapted() {},
    renderVerdict() {},
    state: {},
    t() {
      return {
        asIsNote: 'Lantern left this unchanged.',
        externalActionNote: 'Lantern cannot do this action.',
        detailNote: 'Lantern built a prompt.',
        vagueNote: 'Lantern needs details.',
        a11yBuilt: 'Built {n}',
        a11yBuiltVague: 'Built vague {n}',
        a11yUnchanged: 'Unchanged {n}'
      };
    },
    announce() {},
    els: { result: { scrollIntoView() {} } },
    motion() { return 'auto'; },
    pushHistory() {},
    recordRun() {},
    save() {},
    toast() {}
  });

  doBuild();

  assert.deepEqual(shown, ['Write a haiku about rain.', 'Lantern left this unchanged.', 'ok']);
});

test('a request missing source material receives a specific material-needed result note', () => {
  let shown = null;
  const doBuild = contentFunction('doBuild', '\n\n  /* Where a new chat lives', {
    collect() { return { text: 'Summarize the report.' }; },
    E: {
      buildPrompt() {
        return { prompt: 'Summarize the report.', vague: false, asIs: true, why: 'sourceMissing', adapted: [] };
      }
    },
    showResult(...args) { shown = args; },
    renderAdapted() {},
    renderVerdict() {},
    state: {},
    t() {
      return {
        asIsNote: 'Lantern left this unchanged.',
        externalActionNote: 'Lantern cannot do this action.',
        sourceMissingNote: 'Add the report first.',
        codeMissingNote: 'Add the code first.',
        detailNote: 'Lantern built a prompt.',
        vagueNote: 'Lantern needs details.',
        a11yBuilt: 'Built {n}',
        a11yBuiltVague: 'Built vague {n}',
        a11yUnchanged: 'Unchanged {n}',
        a11yNeedMaterial: 'Add material first.'
      };
    },
    announce() {},
    els: { result: { scrollIntoView() {} } },
    motion() { return 'auto'; },
    pushHistory() {},
    recordRun() {},
    save() {},
    toast() {}
  });

  doBuild();

  assert.deepEqual(shown, ['Summarize the report.', 'Add the report first.', 'ask']);
});

test('a strict output contract receives a specific preservation note', () => {
  let shown = null;
  let announced = '';
  const doBuild = contentFunction('doBuild', '\n\n  /* Where a new chat lives', {
    collect() { return { text: 'Return only valid JSON.' }; },
    E: {
      buildPrompt() {
        return { prompt: 'Return only valid JSON.', vague: false, asIs: true, why: 'outputContract', adapted: [] };
      }
    },
    showResult(...args) { shown = args; },
    renderAdapted() {},
    renderVerdict() {},
    state: {},
    t() {
      return {
        outputContractNote: 'Keep the JSON contract.',
        a11yOutputContract: 'Kept the JSON contract.',
        detailNote: 'Lantern built a prompt.',
        a11yBuilt: 'Built {n}',
        a11yBuiltVague: 'Built vague {n}'
      };
    },
    announce(message) { announced = message; },
    els: { result: { scrollIntoView() {} } },
    motion() { return 'auto'; },
    pushHistory() {},
    recordRun() {},
    save() {}
  });

  doBuild();

  assert.deepEqual(shown, ['Return only valid JSON.', 'Keep the JSON contract.', 'ask']);
  assert.equal(announced, 'Kept the JSON contract.');
});

test('a reorder-only prompt receives an explicit order-only result note', () => {
  let shown = null;
  let announced = '';
  const doBuild = contentFunction('doBuild', '\n\n  /* Where a new chat lives', {
    collect() { return { text: 'Summarize this report.' }; },
    E: {
      buildPrompt() {
        return {
          prompt: 'The report text.\n\nSummarize this report.',
          vague: false,
          asIs: false,
          why: 'reordered',
          adapted: [{ id: 'reordered' }]
        };
      }
    },
    showResult(...args) { shown = args; },
    renderAdapted() {},
    renderVerdict() {},
    state: {},
    t() {
      return {
        reorderedNote: 'Only the order changed.',
        a11yReordered: 'Reordered only.',
        detailNote: 'Lantern built a prompt.',
        a11yBuilt: 'Built {n}',
        a11yBuiltVague: 'Built vague {n}'
      };
    },
    announce(message) { announced = message; },
    els: { result: { scrollIntoView() {} } },
    motion() { return 'auto'; },
    pushHistory() {},
    recordRun() {},
    save() {}
  });

  doBuild();

  assert.deepEqual(shown, [
    'The report text.\n\nSummarize this report.',
    'Only the order changed.',
    'ok'
  ]);
  assert.equal(announced, 'Reordered only.');
});

test('pre-build guidance prioritizes a known limit over the normal route recommendation', () => {
  const route = { hidden: true, textContent: '', dataset: {} };
  const localClasses = [];
  const modelClasses = [];
  const renderRouting = contentFunction('renderRouting', '\n\n  /* With the panel closed', {
    state: {
      routing: { recommend: 'model', topReasons: ['many parts'], verdict: 'Use the model.' },
      usefulness: { helps: 'material', why: 'sourceMissing' }
    },
    els: {
      btnLocal: { classList: { toggle(name, value) { localClasses.push([name, value]); } } },
      btnModel: { classList: { toggle(name, value) { modelClasses.push([name, value]); } } },
      route
    },
    t() {
      return {
        useSourceMissing: 'Add the source text first.',
        recommend: 'Recommended'
      };
    },
    sub(value) { return value; }
  });

  renderRouting();

  assert.equal(route.textContent, 'Add the source text first.');
  assert.equal(route.dataset.rec, 'limit');
  assert.equal(route.hidden, false);
  assert.deepEqual(localClasses, [['ln-btn-primary', false]]);
  assert.deepEqual(modelClasses, [['ln-btn-primary', true]]);
});

test('pre-build guidance explains a reorder-only result without calling it a full build', () => {
  const route = { hidden: true, textContent: '', dataset: {} };
  const renderRouting = contentFunction('renderRouting', '\n\n  /* With the panel closed', {
    state: {
      routing: { recommend: 'local', topReasons: [], verdict: 'Use local.' },
      usefulness: { helps: 'reorder', why: 'reordered' }
    },
    els: {
      btnLocal: { classList: { toggle() {} } },
      btnModel: { classList: { toggle() {} } },
      route
    },
    t() { return { useReordered: 'Material first, task second.', recommend: 'Recommended' }; },
    sub(value) { return value; }
  });

  renderRouting();

  assert.equal(route.textContent, 'Material first, task second.');
  assert.equal(route.dataset.rec, 'reorder');
  assert.equal(route.hidden, false);
});

test('hard-limit results do not offer a force-expand control that cannot work', () => {
  const canOverrideUseLimit = contentFunction('canOverrideUseLimit', '\n\n  function renderVerdict', {});

  assert.equal(canOverrideUseLimit({ why: 'externalAction' }), false);
  assert.equal(canOverrideUseLimit({ why: 'sourceMissing' }), false);
  assert.equal(canOverrideUseLimit({ why: 'codeMissing' }), false);
  assert.equal(canOverrideUseLimit({ why: 'outputContract' }), false);
  assert.equal(canOverrideUseLimit({ why: 'clearRequest' }), true);
  assert.equal(canOverrideUseLimit({ why: 'ownPrompt' }), true);
});
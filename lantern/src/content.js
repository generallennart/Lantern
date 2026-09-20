/* Lantern — in-page panel.
 *
 * Everything here is user-initiated and DOM-level. The extension never calls an
 * OpenAI endpoint, never reads the session token, and never sends a message on
 * the user's behalf without a click. The "sharpen" path is an ordinary tab
 * navigation to a chatgpt.com URL — the same thing a bookmark would do. Reading
 * the last reply is reading the page the user is already looking at.
 */

(function () {
  'use strict';
  if (window.__lnMounted) return;
  window.__lnMounted = true;

  const E = window.LN_ENGINE;
  const I = window.LN_I18N;
  /* Strings carry {ai} rather than a provider name, because the same panel now
   * stands in three different assistants and "sharpen with ChatGPT" is wrong in
   * two of them. Substituting here rather than at each call site means every
   * consumer — buttons, placeholders, toasts, announcements — gets it right
   * without having to remember to.
   *
   * Cached per language and provider: this is called on every render, and
   * rebuilding a couple of hundred strings each time would be silly. */
  /* Rules text reaches the panel too — follow-up cards, the router's reasons —
   * and it carries the same placeholder. One substitution function, used
   * wherever either source reaches the DOM. */
  function sub(v) {
    if (typeof v !== 'string' || v.indexOf('{ai}') === -1) return v;
    return v.split('{ai}').join((state.provider && state.provider.label) || 'ChatGPT');
  }

  let _tCache = null, _tKey = '';
  const t = () => {
    const base = I[state.lang] || I.en;
    const ai = (state.provider && state.provider.label) || 'ChatGPT';
    const key = state.lang + '|' + ai;
    if (_tKey === key && _tCache) return _tCache;
    const out = {};
    Object.keys(base).forEach(k => {
      const v = base[k];
      out[k] = (typeof v === 'string' && v.indexOf('{ai}') !== -1)
        ? v.split('{ai}').join(ai) : v;
    });
    _tKey = key; _tCache = out;
    return out;
  };
  /* The same overlay the engine uses: a hosted rules file adds to the bundled
   * rules rather than replacing them. Replacing could never have worked — ten
   * fields in rules.js are functions and JSON cannot carry one, so any real
   * hosted file would have arrived missing them. */
  let _R = null, _RFrom = null;
  const R = () => {
    const over = window.LN_RULES_OVERRIDE;
    if (!over || !over.archetypes) return window.LN_RULES;
    if (_RFrom !== over) { _R = E.mergeRules(window.LN_RULES, over); _RFrom = over; }
    return _R;
  };

  /* The mark, the same drawing as icons/icon128.png. It was a spark while the
   * extension was called Klartext; under the name Lantern the mark and the
   * name should be the same idea. */
  const ICON_MARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.2a2 2 0 0 1 4 0"/><path d="M7.6 6.2h8.8"/><path d="M9 6.2 7.4 17.6h9.2L15 6.2"/><path d="M6.9 20.4h10.2"/><path d="M7.4 17.6h9.2"/><path d="M12 9.4c1.9 1.6 2.6 2.9 2.6 4.1a2.6 2.6 0 0 1-5.2 0c0-1.2.7-2.5 2.6-4.1z" fill="currentColor" stroke="none" opacity=".85"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

  /* Used only if panel.css fails to load, so a fetch error degrades to
   * something plain rather than an unreadable pile of controls. */
  const FALLBACK_CSS =
    '.ln{font-family:system-ui,sans-serif;font-size:16px;color:#111;--accent:#0f7a5a;--accent-fg:#ffffff}' +
    '.ln-fab{position:fixed;right:20px;bottom:116px;z-index:2147483000;padding:10px 14px;' +
    'border-radius:999px;border:1px solid #ccc;background:#fff;cursor:pointer}' +
    '.ln-panel{position:fixed;right:16px;top:16px;bottom:16px;width:412px;z-index:2147483001;' +
    'background:#fff;border:1px solid #ccc;border-radius:12px;overflow:auto;padding:12px}' +
    '.ln-panel[hidden],.ln-fab[hidden],[hidden]{display:none!important}' +
    '.ln textarea,.ln input,.ln select{width:100%;font:inherit;margin-bottom:8px}';

  const FIELDS = ['aud', 'fmt', 'inc', 'avo', 'ctx', 'ex'];
  const FIELD_OF_CHECK = { audience: 'aud', format: 'fmt', context: 'ctx', example: 'ex' };
  const HISTORY_MAX = 8;
  const STORE = window.LN_STORE;   // schema, migration, validation, reset
  const PROV = window.LN_PROVIDERS;


  /* prefers-reduced-motion is a CSS media query; scrollIntoView takes a
   * JavaScript option, so the setting has to be read by hand here too. */
  function motion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    } catch (e) { return 'smooth'; }
  }
  const SHARPEN_WINDOW = 5 * 60 * 1000;

  /* This tab was opened by Lantern in the tab the user came from. Read at
   * script start, before the assistant's own router has a chance to rewrite
   * the URL.
   *
   *   ln=sharpen  the sharpen flow: watch for the rewritten prompt to come
   *               back in a code block, and say so while waiting.
  *   ln=open     any other hand-off (new chat, chat move): just be open, with
  *               the prompt ready in Lantern for an explicit insert.
   *
   * Both mean the same thing about the panel itself: the person clicked a
   * button that opened this tab, so they are already mid-task here. Arriving
   * folded away to the edge makes them find and click Lantern a second time to
   * get back to the thing they were already doing. */
  const LN_MARK = (/ln=(sharpen|open)/.exec(location.hash) || [])[1] || '';
  const IS_SHARPEN_TAB = LN_MARK === 'sharpen';
  const IS_HANDOFF_TAB = LN_MARK === 'open';

  const state = {
    lang: (navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en',
    manualLang: false, manualKind: false, manualGoal: false, corrected: false, improveExplicit: false, manualAtText: '',
    goal: 'answer',
    provider: null,       // which assistant this page is, from the hostname
    box: null,            // where the user dragged the panel to, if they did
    modelLabel: null,     // "Opus 5", not just the token that matched
    settingsRaw: {},      // the stored settings object, so saving the box keeps them
    model: null,          // what the page's model picker says
    modelChoice: 'auto',  // ...unless the user overrode it
    tab: 'prompt',
    routing: null,
    usefulness: null,
    introSeen: false,
    history: [],
    parts: [],           // pieces collected instead of sent as separate messages
    queue: [],           // written now, to be sent by hand when the limit is back
    collecting: false,   // the user said more is coming; keep the collector out
    answer: null,        // analysis of the last ChatGPT reply on this page
    answerText: '',      // ...and its raw text, for language detection
    capturing: false,    // waiting for a sharpened prompt to appear
    sharpenBefore: '',   // answer that existed when the sharpen request was inserted
    sharpenStarted: 0,   // keeps an abandoned capture from matching a later code block
    sharpenSource: '',   // original request that a sharpened result must preserve
    sentPrompt: '',      // last full prompt inserted in this chat; repeated only on demand
    showAllFollowUps: false,
    showFollowAnyway: false,
    pageLayer: true,     // put affordances into the page while the panel is open
    statusOn: false,     // ask the provider's status page? off until switched on
    textSize: 'normal',  // how big the panel's own text is
    accent: 'green',     // which accent colour it uses
    status: null,
    handover: '',        // the collected handover, ready to launch a new chat
    lastAdapted: [],     // what the last build changed for this provider
    carry: '',           // a prompt this tab was opened with, if it was
    carryAutoInsert: false,
    mvWaiting: 0,        // timestamp of a handover request awaiting its answer
    mvBefore: '',        // last answer when the handover request was inserted
    mvParts: ['decisions']
  };

  let root, panel, fab, els = {}, toastTimer, inputTimer, answerTimer;
  let lastAnswerKey = '';
  let pageLookRestore = null;

  /* ---------------------------------------------------------------- mount */

  function mount() {
    /* Which assistant is this? From the hostname only — never the page title or
     * anything else the page controls, because a lookalike domain must not be
     * able to talk Lantern into treating it as ChatGPT. If it is not one we
     * know, nothing mounts. */
    state.provider = PROV ? PROV.detect(location.hostname) : null;
    if (!state.provider) return;

    const host = document.createElement('div');
    host.id = 'lantern-root';
    host.style.all = 'initial';
    document.documentElement.appendChild(host);
    const sh = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = FALLBACK_CSS;
    sh.appendChild(style);

    root = document.createElement('div');
    root.className = 'ln';
    sh.appendChild(root);

    /* getURL throws outright once the extension context is gone, and this runs
     * early enough that an update landing mid-mount would take the whole panel
     * with it. The fallback stylesheet is already in place, so the cost of
     * failing here is a plainer panel, not no panel. */
    try {
      fetch(chrome.runtime.getURL('src/panel.css'))
        .then(r => r.ok ? r.text() : Promise.reject(new Error(r.status)))
        .then(css => { style.textContent = css; applyLook(); })
        .catch(() => { /* fallback CSS stays in place */ });
    } catch (e) { /* same */ }

    buildFab();
    buildPanel();
    containPanelEvents(root);
    syncTheme();

    new MutationObserver(syncTheme).observe(document.documentElement, {
      attributes: true, attributeFilter: ['class', 'data-theme']
    });
    document.addEventListener('keydown', onKey, true);
    watchAnswers();
  }

  /* Chat sites commonly delegate editor events high in the document tree.
   * Native events from a shadow root are composed, so without this boundary a
   * host handler can mistake typing in Lantern for typing in its composer.
   * Stop only propagation: Lantern's target/default behavior remains intact. */
  const PANEL_EVENT_TYPES = [
    'click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup',
    'touchstart', 'touchmove', 'touchend', 'keydown', 'keyup', 'keypress',
    'beforeinput', 'input', 'change', 'compositionstart', 'compositionupdate',
    'compositionend', 'paste', 'cut', 'drop', 'focusin', 'focusout', 'wheel'
  ];

  function containPanelEvents(target) {
    if (!target || !target.addEventListener) return;
    PANEL_EVENT_TYPES.forEach(type => target.addEventListener(type, event => {
      try { event.stopPropagation(); } catch (e) {}
    }));
  }

  function onKey(e) {
    if (e.key === 'Escape' && panel && !panel.hidden) {
      // Escape backs out one layer at a time: help first, then the panel.
      // Closing the whole thing because someone wanted to leave the help is
      // the kind of small rudeness that makes a tool feel hostile.
      if (els.help && !els.help.hidden) closeHelp();
      else close();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
      e.preventDefault();
      panel.hidden ? open() : close();
    }
  }

  /* ---- how it looks -------------------------------------------------------
   *
   * Both of these came from the first person outside this project to use it,
   * and both are the same kind of request: the panel had decided something
   * about their eyes that was not its to decide.
   *
   *   text size   "the text is to small and i want to be able to adjust it"
   *   accent      "i would like to be able to change the colorscheme"
   *
   * Applied as one variable and one attribute on the shadow root, so nothing
   * else in the panel has to know about either. Every type size in panel.css
   * is a multiple of --ln-fs; every accent is a full light/dark pair. */
  const TEXT_SIZES = { small: 14, normal: 16, gross: 18, sehr: 20, riesig: 22 };
  const ACCENTS = ['green', 'blue', 'violet', 'rose', 'slate'];

  function applyLook() {
    if (!root) return;
    const px = TEXT_SIZES[state.textSize] || TEXT_SIZES.normal;
    root.style.setProperty('--ln-fs', px + 'px');
    /* green is the default and carries no attribute, so an unknown value out
     * of a corrupt or hand-edited settings record lands on the default rather
     * than on a palette that does not exist and therefore has no colours. */
    if (state.accent && state.accent !== 'green' && ACCENTS.indexOf(state.accent) !== -1) {
      root.setAttribute('data-accent', state.accent);
    } else {
      root.removeAttribute('data-accent');
    }
    if (window.LN_INPAGE && window.LN_INPAGE.isOn()) syncPageLook();

    // Bigger text makes the panel's contents taller, and the handle rides its
    // edge, so the handle has to be told.
    try { placeFab(); } catch (e) {}
    paintPanelSettings();
  }

  function paintPanelSettings() {
    if (typeof panel === 'undefined' || !panel) return;
    panel.querySelectorAll('[data-size]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.size === state.textSize));
    });
    panel.querySelectorAll('.ln-setting-colour[data-accent]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.accent === state.accent));
    });
    if (els.pageLayer) els.pageLayer.checked = !!state.pageLayer;
  }

  function savePanelSettings() {
    state.settingsRaw = Object.assign({}, state.settingsRaw || {}, {
      textSize: state.textSize,
      accent: state.accent,
      pageLayer: !!state.pageLayer
    });
    try { STORE.set({ lnSettings: state.settingsRaw }); } catch (e) {}
  }

  function setTextSize(size) {
    if (!Object.prototype.hasOwnProperty.call(TEXT_SIZES, size)) return;
    state.textSize = size;
    applyLook();
    savePanelSettings();
  }

  function setAccent(accent) {
    if (ACCENTS.indexOf(accent) === -1) return;
    state.accent = accent;
    applyLook();
    savePanelSettings();
  }

  function syncPageLook() {
    if (!root) return;
    try {
      const de = document.documentElement;
      if (!pageLookRestore) {
        pageLookRestore = {
          accent: {
            value: de.style.getPropertyValue('--ln-accent'),
            priority: de.style.getPropertyPriority('--ln-accent')
          },
          accentFg: {
            value: de.style.getPropertyValue('--ln-accent-fg'),
            priority: de.style.getPropertyPriority('--ln-accent-fg')
          }
        };
      }
      const cs = getComputedStyle(root);
      de.style.setProperty('--ln-accent', cs.getPropertyValue('--accent').trim() || '#0f7a5a');
      de.style.setProperty('--ln-accent-fg', cs.getPropertyValue('--accent-fg').trim() || '#ffffff');
    } catch (e) {}
  }

  function clearPageLook() {
    if (!pageLookRestore) return;
    try {
      const style = document.documentElement.style;
      [['--ln-accent', pageLookRestore.accent], ['--ln-accent-fg', pageLookRestore.accentFg]].forEach(([name, before]) => {
        if (before && before.value) style.setProperty(name, before.value, before.priority || '');
        else style.removeProperty(name);
      });
    } catch (e) {}
    pageLookRestore = null;
  }

  function syncTheme() {
    const de = document.documentElement;
    const dark = de.classList.contains('dark') ||
      de.dataset.theme === 'dark' ||
      (!de.classList.contains('light') && de.dataset.theme !== 'light' &&
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) root.setAttribute('data-dark', ''); else root.removeAttribute('data-dark');
    /* Each accent is a light/dark PAIR, so a theme flip changes the values the
     * in-page layer was handed. Re-copying them is the whole cost. */
    try { applyLook(); } catch (e) {}
  }

  /* ------------------------------------------------- which model is in use */

  /* Read the model picker. Every selector here is a guess about someone else's
   * markup, so the whole thing is written to return null rather than to be
   * clever: an unrecognised model just means the balanced prompt, which is the
   * right default anyway. */
  /* Every provider names its models differently and renames them often —
   * Google shipped four Flash versions in four months while Pro stood still,
   * and Anthropic's top model is now Fable rather than Opus. So the names come
   * from the provider file, the match is a tier rather than an identity, and an
   * unrecognised model means the balanced prompt, which is the right default
   * anyway. Renaming a model degrades this to "sensible", never to "broken". */
  function modelNamePattern() {
    const p = state.provider;
    const names = [];
    ((p && p.tiers) || []).forEach(t => (t.names || []).forEach(n => names.push(n)));
    if (!names.length) return null;
    // Longest first, so "flash-lite" is tried before "flash".
    names.sort((a, b) => b.length - a.length);
    const esc = names.map(n => n.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'));
    try { return new RegExp('(' + esc.join('|') + ')', 'i'); } catch (e) { return null; }
  }

  /* Candidate elements that might be a model picker, most-likely first.
   *
   * The exact-selector approach failed on real chatgpt.com: the self-check came
   * back with `pickerText: ""`, meaning not one of five selectors matched
   * anything at all. That is a worse failure than a name that did not match,
   * and it is the one an exact selector list will always eventually hit,
   * because it is someone else's markup and they get to change it.
   *
   * So: the provider's own selectors are tried first, and then a generic sweep
   * for things that *behave* like a picker — a control that opens a menu, or a
   * button with a short label. Structure outlives class names.
   *
   * Note from the same reports: the user's UI is in German. "Modell" contains
   * "odel", so the aria-label probe survives translation by luck; Gemini's says
   * "Modusauswahl" and survives only because the element selector matched. A
   * language-independent net is the point of the sweep. */
  function pickerCandidates() {
    const seen = new Set();
    const out = [];
    const push = (el, why, named) => {
      if (!el || seen.has(el)) return;
      try {
        const msgSel = state.provider && state.provider.dom && state.provider.dom.message;
        if (el.closest('nav, aside, [role="navigation"], [role="list"], #lantern-root, [data-ln]')) return;
        if (msgSel && el.closest(msgSel)) return;
      } catch (e) { return; }
      seen.add(el);
      const label = (el.getAttribute('aria-label') || '').trim();
      const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
      const both = (label + ' ' + text).trim();
      if (!both || both.length > 120) return;
      out.push({ el, why, label, text, both, named: !!named });
    };

    const sels = ((state.provider && state.provider.dom && state.provider.dom.modelPicker) || [])
      .concat(['[data-testid*="model"]', '[data-testid*="switcher"]',
               '[aria-label*="odel"]', '[aria-label*="odell"]', 'button[id*="model"]']);
    sels.forEach(sel => {
      try { document.querySelectorAll(sel).forEach(el => push(el, sel, true)); } catch (e) {}
    });
    // Anything that opens a menu is a plausible picker whatever it is called.
    try {
      const generic = document.querySelectorAll('[aria-haspopup="menu"], [aria-haspopup="listbox"], [aria-haspopup="true"]');
      let scanned = 0;
      for (let i = 0; i < generic.length; i++) {
        const el = generic[i];
        try {
          const msgSel = state.provider && state.provider.dom && state.provider.dom.message;
          if (seen.has(el) || el.closest('nav, aside, [role="navigation"], [role="list"], #lantern-root, [data-ln]')) continue;
          if (msgSel && el.closest(msgSel)) continue;
        } catch (e) { continue; }
        if (scanned >= 48) break;
        scanned++;
        push(el, 'haspopup', false);
      }
    } catch (e) {}
    return out;
  }

  /* ChatGPT's switcher is labelled with a verb — "Switch model" — and does not
   * contain the model name anywhere inside it. The name sits next to the
   * control, so for a named picker whose own text says nothing, the immediate
   * surroundings are read as well. Bounded to a couple of levels and a short
   * length, because "read the parent" turns into "read the whole page" fast. */
  function aroundPicker(c) {
    let n = c.el, hops = 0, best = '';
    while (n && hops < 3) {
      n = n.parentElement;
      hops++;
      if (!n) break;
      const tx = (n.innerText || '').trim().replace(/\s+/g, ' ');
      if (tx && tx.length <= 90) best = tx;
      if (tx && tx.length > 90) break;
    }
    return best;
  }

  /* The token is what decides the tier; the label is what the user is shown.
   * Reported as "Opus" before this, when the chip plainly said "Opus 5" — the
   * version is the part a person recognises. */
  function detectModel() {
    const re = modelNamePattern();
    if (!re) return null;
    const cands = pickerCandidates();

    /* Pass one: the name inside something that is demonstrably the picker.
     * `named` means it matched a selector that mentions the model by name, so
     * a word found there is the model. A generic menu-opener is not enough on
     * its own — that is how "Upgrade to Pro" became the detected model. */
    for (const c of cands) {
      if (!c.named) continue;
      const m = c.both.match(re);
      if (m) { state.modelLabel = versionedLabel(c.both, m[1]); return m[1].toLowerCase(); }
    }

    /* Pass two: the picker is labelled with a verb, so look immediately around
     * it. Still anchored to a real picker — never a free sweep of the page. */
    for (const c of cands) {
      if (!c.named) continue;
      const near = aroundPicker(c);
      const m = near && near.match(re);
      if (m) { state.modelLabel = versionedLabel(near, m[1]); return m[1].toLowerCase(); }
    }

    /* Pass three: a menu-opener whose label *starts* with the model name, which
     * is what a chip like "Opus 5 Extra" looks like. A word buried mid-sentence
     * in some other button does not qualify. */
    for (const c of cands) {
      const m = c.both.match(re);
      if (!m) continue;
      if (new RegExp('^\\s*' + m[1].replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'), 'i').test(c.text) ||
          new RegExp(':\\s*' + m[1].replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'), 'i').test(c.label)) {
        state.modelLabel = versionedLabel(c.both, m[1]);
        return m[1].toLowerCase();
      }
    }

    state.modelLabel = null;
    return null;
  }

  /* "opus" out of "Model: Opus 5 Extra" is "Opus 5". Anything that is not a
   * version number right after the name is left off. */
  function versionedLabel(text, token) {
    try {
      const re = new RegExp(token.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') +
                            '\\s*([0-9]+(?:\\.[0-9]+)*)?', 'i');
      const m = text.match(re);
      if (!m) return cap(token);
      return cap(token) + (m[1] ? ' ' + m[1] : '');
    } catch (e) { return cap(token); }
  }

  /* Claude's picker chip carries a second value: the effort level, from Low to
   * Max. It is a real quota lever — Anthropic says higher effort reaches your
   * limit faster — and no other provider exposes one, so it is read separately
   * and simply absent elsewhere. */
  /* "Extra high" is shown in the menu but the chip abbreviates it to "Extra",
   * which the first version of this regex did not match — found by reading the
   * real picker, which said "Opus 5  Extra". Longest alternative first, or
   * "high" would win inside "extra high". */
  /* Claude and Gemini both expose a reasoning-effort control, and both hide the
   * fact that it is a spending decision. The words differ, so the pattern is
   * built from whichever provider this is rather than hardcoded — and a
   * provider with no such control simply has none. */
  const EFFORT_WORDS = {
    claude: /\b(extra high|extra|max|high|medium|low)\b/i,
    gemini: /\b(deep think|extended|standard)\b/i
  };
  function detectEffort() {
    if (!state.provider) return null;
    const EFFORT = EFFORT_WORDS[state.provider.id];
    if (!EFFORT) return null;
    for (const c of pickerCandidates()) {
      const m = c.both.match(EFFORT);
      if (m) {
        const v = m[1].toLowerCase();
        return v === 'extra' ? 'extra high' : v;   // the chip abbreviates it
      }
    }
    return null;
  }

  function currentTier() {
    const p = state.provider;
    const name = (state.modelChoice && state.modelChoice !== 'auto') ? state.modelChoice : state.model;
    /* The ChatGPT model labels have changed too quickly, and the reported
     * Luna/Sol/Terra ranking contradicted the shipped assumptions. Until a
     * prompt-shape difference is verified, neutral framing is safer than a
     * confident per-model adjustment. */
    if (p && p.id === 'chatgpt') return 'balanced';
    if (p && PROV) return PROV.tierOf(p, name);
    return E.tierOf(name);
  }

  /* Anthropic publishes per-model prompting guidance that contradicts itself
   * between models — "be concise" helps Opus and hurts Fable. That only
   * resolves at the family level, so it is read separately from the tier. */
  function currentFamily() {
    const p = state.provider;
    if (!p || !PROV) return null;
    const name = (state.modelChoice && state.modelChoice !== 'auto') ? state.modelChoice : state.model;
    return PROV.familyOf(p, name);
  }

  function modelDisplayName() {
    if (state.modelChoice && state.modelChoice !== 'auto') return cap(state.modelChoice);
    if (!state.model) return null;
    return state.modelLabel || cap(state.model);
  }

  function cap(x) { return String(x || '').charAt(0).toUpperCase() + String(x || '').slice(1); }

  function tierLabel(tier) {
    const t = (R().modelTiers || []).find(x => x.id === tier);
    return t ? t.label[state.lang] : tier;
  }

  /* Provider status, asked for only when the user has switched it on.
   *
   * Shown only when something is actually wrong. A green "all systems
   * operational" line every time you open the panel is noise, and noise is what
   * makes people stop reading warnings. The point is the one day in fifty when
   * the answer is bad because the service is degraded and nothing on the page
   * says so — that day, the user otherwise concludes they wrote a bad prompt. */
  function checkStatus() {
    if (!state.statusOn || !state.provider || !state.provider.status) return;
    const url = state.provider.status.url;
    try {
      chrome.runtime.sendMessage({ type: 'LN_STATUS', url: url }, (r) => {
        if (!state.statusOn) return;
        if (chrome.runtime.lastError || !r || !r.ok) {
          state.status = null;
          renderStatus();
          return;
        }
        state.status = r;
        renderStatus();
      });
    } catch (e) {}
  }

  function renderStatus() {
    const r = state.status;
    if (!els.status) return;
    if (!r || !r.ok || r.healthy) { els.status.hidden = true; return; }
    const L = t();
    els.status.textContent = L.statusBad
      .replace('{p}', state.provider.label)
      .replace('{d}', r.description || '');
    els.status.dataset.level = (r.indicator === 'critical' || r.indicator === 'major') ? 'major' : 'minor';
    els.status.hidden = false;
  }

  function renderModel() {
    const L = t();
    const name = modelDisplayName();
    const tier = currentTier();
    const parts = [];
    parts.push(name
      ? (state.provider && state.provider.id === 'chatgpt'
        ? L.modelNeutral(name)
        : L.modelFor(name, tierLabel(tier)))
      : L.modelUnknown);
    // This is prompt-shape guidance, not a verdict about which model is best.
    if (tier === 'deep') parts.push(L.modelDeepHint);

    /* Claude's picker carries a second value nobody explains: the effort level.
     * Anthropic states plainly that higher effort "use[s] more tokens, so
     * you'll reach your usage limits faster" — but the UI shows "Extra" next to
     * the model name with no indication that it is a spending decision. A user
     * on Opus 5 at Extra is draining a five-hour window several times faster
     * than they need to for most of what they ask, and nothing tells them.
     * (Observed on a real account: "Opus 5  Extra" on a Pro plan.) */
    const effort = detectEffort();
    const costly = (state.provider && state.provider.costlyEfforts) || [];
    if (effort && costly.indexOf(effort) !== -1) {
      parts.push(L.effortCostly.replace('{e}', cap(effort)));
    }

    els.modelNote.textContent = parts.join(' · ');
    els.modelNote.dataset.tier = tier;
    els.modelNote.hidden = false;
  }

  /* --------------------------------------------------- reading the page */

  /* The selector for one kind of node on THIS assistant.
   *
   * This exists because four separate places in this file had ChatGPT's
   * `[data-message-author-role]` written into them directly, while
   * providers.js had carried the Claude and Gemini equivalents for two
   * versions. The effect was quiet and total: on Claude and Gemini the last
   * answer was never found, so no follow-up was ever about the answer, the
   * handover tab always said the chat was empty, and the memory check ran with
   * a turn count of zero — which is the branch that makes it *most* willing to
   * cry memory.
   *
   * It survived because the test harness planted ChatGPT's markup whatever
   * provider the page claimed to be, so a test labelled Claude was a ChatGPT
   * test. The harness now builds each assistant's own shape; this reads it. */
  function sel(kind, fallback) {
    const d = state.provider && state.provider.dom;
    return (d && d[kind]) || fallback;
  }
  function nodes(kind, fallback) {
    try { return document.querySelectorAll(sel(kind, fallback)); }
    catch (e) { return []; }
  }

  function lastAssistantEl() {
    const found = nodes('assistant', '[data-message-author-role="assistant"]');
    if (found.length) return found[found.length - 1];
    const md = document.querySelectorAll('.markdown');
    return md.length ? md[md.length - 1] : null;
  }

  function lastAnswerText() {
    const el = lastAssistantEl();
    if (!el) return '';
    // Belt and braces: never read anything Lantern put on the page. The bar is
    // attached as a sibling for exactly this reason, but a future change that
    // nests it must not silently turn the analysis into a feedback loop.
    const mine = el.querySelector('[data-ln]');
    if (!mine) return el.innerText || '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[data-ln]').forEach(n => n.parentNode.removeChild(n));
    return clone.textContent || '';
  }

  /* The sharpen meta-prompt asks for the result in a code block, which is also
   * the only part worth lifting — the rest is ChatGPT's chatter. */
  function lastAnswerCode() {
    const el = lastAssistantEl();
    if (!el) return '';
    const blocks = el.querySelectorAll('pre code, pre');
    if (!blocks.length) return '';
    let best = '';
    blocks.forEach(b => { const s = (b.innerText || '').trim(); if (s.length > best.length) best = s; });
    return best;
  }

  /* ChatGPT streams its reply token by token, so this fires a great deal.
   * Everything expensive sits behind a debounce and a cheap change key. */
  function watchAnswers() {
    if (!document.body) return;
    const obs = new MutationObserver((recs) => {
      /* Most of what this observer sees is not an answer.
       *
       * Typing in the composer mutates the page on every keystroke, and so
       * does inserting a prompt into it — which is precisely the moment a
       * tester reported as „es laggt HART wenn man insert into chat drückt".
       * Each of those used to schedule a full re-read of the last answer, and
       * a re-read calls innerText, and innerText forces the browser to lay the
       * whole conversation out again before it can answer. On a long chat that
       * is the single most expensive thing Lantern does, and none of it was
       * telling us anything: the answer had not changed.
       *
       * So mutations that only touch the composer or Lantern's own nodes are
       * dropped here, before any work is scheduled. */
      if (!aboutTheAnswer(recs)) return;
      state.wakes = (state.wakes || 0) + 1;
      clearTimeout(answerTimer);
      answerTimer = setTimeout(onAnswerChanged, 1200);
    });
    obs.observe(document.body, { childList: true, characterData: true, subtree: true });
    setTimeout(onAnswerChanged, 1500);
  }

  function aboutTheAnswer(recs) {
    const comp = composer();
    const n = Math.min(recs.length, 40);
    for (let i = 0; i < n; i++) {
      let t = recs[i].target;
      if (t && t.nodeType !== 1) t = t.parentElement;
      if (!t) continue;
      if (comp && (t === comp || comp.contains(t))) continue;
      if (t.closest && t.closest('#lantern-root, [data-ln]')) continue;
      return true;
    }
    /* Everything we looked at was ours or the composer's. If there were more
     * records than we looked at, err towards doing the work. */
    return recs.length > n;
  }

  /* These sites are single-page apps: opening another conversation replaces the
   * messages without reloading anything, so nothing here is torn down. Without
   * this, the count of times the user has pushed back — which is what the drift
   * warning is actually about — would carry across into a chat where they have
   * pushed back no times at all, and the panel would tell them to move a
   * conversation three messages old.
   *
   * A drop is the signal, not a rise: a new chat has fewer messages than the
   * one before it, and a chat cannot lose messages any other way. */
  let lastCount = -1;
  function noticeChatSwitch() {
    const n = messageCount();
    if (lastCount >= 0 && n < lastCount) {
      state.pushes = 0;
      state.capturing = false;
      state.sharpenBefore = '';
      state.sharpenStarted = 0;
      state.sharpenSource = '';
      state.sentPrompt = '';
      renderFeedbackContext();
      if (els.drift) renderDrift();
    }
    lastCount = n;
  }

  function onAnswerChanged() {
    dropScans();
    noticeChatSwitch();
    const m = detectModel();
    if (m !== state.model) { state.model = m; if (els.modelNote) renderModel(); }
    const txt = lastAnswerText();
    // The turn count is part of the key: the memory verdict depends on how much
    // the user has said, so it has to be re-evaluated when that changes even
    // though the answer text has not.
    const key = txt.length + '|' + txt.slice(-48) + '|' + userTurns();
    if (key === lastAnswerKey) { refreshPage(); return; }
    lastAnswerKey = key;
    /* Counted because "es laggt HART" is not a number and „braucht lange
     * zwischen schritten" is not either. A re-read is the most expensive thing
     * Lantern does on somebody else's page; how often it happens is the first
     * question anybody should ask about it, and now the self-check answers it
     * without needing a profiler. */
    state.reads = (state.reads || 0) + 1;
    state.answerText = txt;
    state.answer = E.analyzeAnswer(txt, {
      turns: userTurns(),
      provider: state.provider && state.provider.id
    });
    // A German conversation must get German follow-ups: inserting an English
    // message into a German chat is worse than not offering one.
    if (!state.manualLang) {
      const guess = autoLang();
      if (guess !== state.lang) { state.lang = guess; applyLang(); }
    }
    if (state.capturing) tryCapture();
    tryHandoverCollect();
    if (els.followList) renderFollowUps();
    if (els.mvSize) renderMove();
    updateGrabLink();
    updateBadge();
    refreshPage();
  }

  /* ------------------------------------------------------------------ ui */

  /* The two innerHTML assignments below are the panel's static skeleton — a
   * string literal in this file with no interpolation of anything from the
   * page, from storage, or from a rules file. Mozilla's linter flags every
   * innerHTML by pattern and cannot tell the difference; it is noted here so a
   * reviewer, and the next person to read this, can. Every value that comes
   * from outside is written with textContent, and the popup's diagnostics were
   * rewritten to DOM calls for exactly that reason. */
  function buildFab() {
    fab = document.createElement('button');
    fab.className = 'ln-fab';
    fab.type = 'button';
    fab.setAttribute('aria-expanded', 'false');
    fab.innerHTML = ICON_MARK + '<span class="ln-fab-label"></span>'
      + '<span class="ln-fab-arrow" aria-hidden="true"></span>'
      + '<span class="ln-fab-badge" hidden></span>';
    /* Toggles, because the handle no longer disappears when the panel opens —
     * it moves to the panel's edge and stays clickable. Pressing it again puts
     * everything back, which is the behaviour a tab on a folder implies. */
    fab.addEventListener('click', () => { (panel && !panel.hidden) ? close() : open(); });
    root.appendChild(fab);
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'ln-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Lantern');
    panel.innerHTML = `
      <div class="ln-head">
        <div class="ln-mark">${ICON_MARK}</div>
        <div class="ln-head-text">
          <div class="ln-title" role="heading" aria-level="1" data-t="brand"></div>
          <div class="ln-sub" data-t="tagline"></div>
        </div>
        <div class="ln-lang" role="group" data-t-label="langGroup">
          <button type="button" data-lang="de" data-t-label="langDe">DE</button>
          <button type="button" data-lang="en" data-t-label="langEn">EN</button>
        </div>
        <button class="ln-help-btn" type="button" data-act="help" data-t-label="helpLabel">?</button>
        <button class="ln-x" type="button" data-act="close" data-t-label="closeLabel">${ICON_X}</button>
      </div>

      <div class="ln-grip ln-grip-sw" data-corner="sw" data-t-label="resizeLabel"></div>
      <div class="ln-grip ln-grip-se" data-corner="se" data-t-label="resizeLabel"></div>
      <div class="ln-grip ln-grip-nw" data-corner="nw" data-t-label="resizeLabel"></div>
      <div class="ln-grip ln-grip-ne" data-corner="ne" data-t-label="resizeLabel"></div>

      <div class="ln-detached" hidden role="alert">
        <div class="ln-detached-text"></div>
        <button class="ln-btn ln-btn-primary" type="button" data-act="reload" data-t="detachedReload"></button>
      </div>

      <div class="ln-tabs" role="tablist">
        <button class="ln-tab" type="button" role="tab" id="ln-tab-prompt" aria-controls="ln-pane-prompt" data-tab="prompt" data-t="tabPrompt"></button>
        <button class="ln-tab" type="button" role="tab" id="ln-tab-follow" aria-controls="ln-pane-follow" data-tab="follow"><span data-t="tabFollow"></span><i class="ln-dot" hidden></i></button>
        <button class="ln-tab" type="button" role="tab" id="ln-tab-move" aria-controls="ln-pane-move" data-tab="move"><span data-t="tabMove"></span><i class="ln-dot" hidden></i></button>
        <button class="ln-tab" type="button" role="tab" id="ln-tab-later" aria-controls="ln-pane-later" data-tab="later"><span data-t="tabLater"></span><i class="ln-dot" hidden></i></button>
        <button class="ln-tab" type="button" role="tab" id="ln-tab-settings" aria-controls="ln-pane-settings" data-tab="settings" data-t="tabSettings"></button>
      </div>

      <div class="ln-help" hidden role="region" aria-labelledby="ln-help-title">
        <div class="ln-help-head">
          <div class="ln-help-title" id="ln-help-title" role="heading" aria-level="2" data-t="helpTitle"></div>
          <button class="ln-link" type="button" data-act="help-close" data-t="helpBack"></button>
        </div>
        <div class="ln-help-lead" data-t="helpLead"></div>
        <!-- A register switch, not a language switch: it works in German and
             English alike and sits with the explainer because that is the only
             thing it changes. A good share of the people this was handed to
             coach or play tennis professionally, and for them patterns, shot
             selection and video analysis are not a metaphor — it is the
             vocabulary they already reason in. -->
        <label class="ln-chk ln-tennis-toggle">
          <input type="checkbox" id="ln-tennis"><span data-t="tennisToggle"></span>
        </label>
        <button class="ln-link ln-compare-open" type="button" data-act="compare" data-t="compareOpen"></button>
        <div class="ln-help-list"></div>
        <div class="ln-compare" hidden></div>
        <!-- Said once, where somebody looking for it will find it. All three
             vendors' trademark terms come down to the same requirement: do not
             imply they built this or endorse it. Nothing here uses their names
             as part of Lantern's own name; this states the rest plainly. -->
        <div class="ln-help-foot" data-t="helpAffiliation"></div>
        <div class="ln-selfcheck">
          <button class="ln-btn ln-btn-sm" type="button" data-act="selfcheck" data-t="checkBtn"></button>
          <div class="ln-selfcheck-out" hidden></div>
        </div>
      </div>

      <div class="ln-body" id="ln-pane-prompt" role="tabpanel" aria-labelledby="ln-tab-prompt" data-pane="prompt">
        <div class="ln-intro" hidden>
          <div class="ln-intro-title" role="heading" aria-level="2" data-t="introTitle"></div>
          <p data-t="introBody"></p>
          <div class="ln-intro-tabs-label" data-t="introTabsLabel"></div>
          <ul class="ln-intro-tabs"></ul>
          <p class="ln-intro-never" data-t="introNeverSends"></p>
          <button class="ln-btn ln-btn-primary ln-btn-sm" type="button" data-act="intro-ok" data-t="introDismiss"></button>
        </div>

        <label class="ln-l" for="ln-text" data-t="inputLabel"></label>
        <textarea id="ln-text" class="ln-main-input"></textarea>

        <!-- What this assistant can do besides write a reply.
             Sits directly under the box because it changes what you are asking
             for, not how it is phrased — everything else Lantern offers is a
             setting and waits behind a fold. -->
        <div class="ln-caps" role="group"></div>
        <div class="ln-caps-note" hidden></div>

        <div class="ln-found" hidden></div>
        <div class="ln-check" hidden></div>

        <div class="ln-parts" hidden>
          <div class="ln-parts-head" role="heading" aria-level="2" data-t="partsTitle"></div>
          <div class="ln-parts-why" data-t="partsWhy"></div>
          <div class="ln-parts-list"></div>
          <div class="ln-parts-actions">
            <button class="ln-btn ln-btn-sm" type="button" data-act="part-add" data-t="partsAdd"></button>
            <button class="ln-link" type="button" data-act="parts-clear" data-t="partsClear"></button>
          </div>
        </div>

        <details class="ln-det ln-det-main">
          <summary><span data-t="detailsToggle"></span><span class="ln-det-count"></span></summary>
          <div class="ln-det-inner">
            <div class="ln-row">
              <label class="ln-l" for="ln-kind" data-t="kindLabel"></label>
              <select id="ln-kind"></select>
            </div>
            <div class="ln-row">
              <label class="ln-l" for="ln-model" data-t="modelLabel"></label>
              <select id="ln-model"></select>
            </div>
            <div class="ln-grid">
              <div class="ln-row">
                <label class="ln-l" for="ln-aud" data-t="audience"></label>
                <input type="text" id="ln-aud">
              </div>
              <div class="ln-row">
                <label class="ln-l" for="ln-fmt" data-t="format"></label>
                <input type="text" id="ln-fmt">
              </div>
              <div class="ln-row">
                <label class="ln-l" for="ln-inc" data-t="include"></label>
                <input type="text" id="ln-inc">
              </div>
              <div class="ln-row">
                <label class="ln-l" for="ln-avo" data-t="avoid"></label>
                <input type="text" id="ln-avo">
              </div>
            </div>
            <div class="ln-row">
              <label class="ln-l" for="ln-ctx" data-t="context"></label>
              <textarea id="ln-ctx" rows="3"></textarea>
            </div>
            <div class="ln-row">
              <label class="ln-l" for="ln-ex" data-t="example"></label>
              <textarea id="ln-ex" rows="3"></textarea>
            </div>
            <div class="ln-toggles">
              <label class="ln-chk"><input type="checkbox" id="ln-scope"><span data-t="tScope"></span></label>
              <label class="ln-chk"><input type="checkbox" id="ln-improve"><span data-t="tImprove"></span></label>
              <label class="ln-chk"><input type="checkbox" id="ln-sources"><span data-t="tSources"></span></label>
              <label class="ln-chk"><input type="checkbox" id="ln-ignorememory"><span data-t="tIgnoreMemory"></span></label>
            </div>
          </div>
        </details>

        <!-- One button, not two.
             A beginner cannot choose between "build it here" and "have ChatGPT
             build it", and being asked to is the first thing that made the
             panel unverständlich. The second path is still one click away, and
             the router still says when it is the better one — it just no longer
             opens with a fork. -->
        <div class="ln-actions">
          <button class="ln-btn ln-btn-primary" type="button" data-act="build" data-path="local">
            <span data-t="build"></span><small data-t="buildHint"></small>
          </button>
          <button class="ln-btn ln-btn-clear" type="button" data-act="clear" data-t="clear"></button>
        </div>
        <div class="ln-route" hidden aria-live="polite"></div>
        <button class="ln-link ln-refine-link" type="button" data-act="refine" data-path="model"
                data-t="refine"></button>

        <!-- What Lantern understood, with the controls attached to it.
             Below the button and after the request, because "correct me" only
             makes sense once there is something to correct. Before that it is a
             row of dropdowns asking a beginner to classify their own question,
             which is the thing they came here not knowing how to do. -->
        <div class="ln-understood" hidden>
          <div class="ln-l" data-t="understoodLabel"></div>
          <div class="ln-goals" role="radiogroup"></div>
        </div>
        <div class="ln-model-note" hidden></div>
        <div class="ln-adapted" hidden></div>
        <div class="ln-status" hidden></div>
        <button class="ln-link ln-grab" type="button" data-act="grab" hidden data-t="sharpenGrab"></button>

        <div class="ln-result" hidden>
          <div class="ln-result-head">
            <div class="ln-result-title">
              <label class="ln-l" for="ln-out" data-t="result"></label>
              <span class="ln-result-updated" hidden></span>
            </div>
          </div>
          <div class="ln-note"></div>
          <div class="ln-verdict" hidden></div>
        <div class="ln-paste" hidden></div>
          <textarea id="ln-out" class="ln-out" spellcheck="false"></textarea>
          <div class="ln-small-actions">
            <button class="ln-btn" type="button" data-act="copy"><span data-t="copy"></span></button>
            <button class="ln-btn" type="button" data-act="newchat"><span data-t="newChat"></span></button>
            <button class="ln-btn" type="button" data-act="queue-add"><span data-t="queueAdd"></span></button>
            <button class="ln-btn ln-btn-primary" type="button" data-act="insert"><span data-t="insert"></span></button>
          </div>
        </div>

        <details class="ln-det ln-hist" hidden>
          <summary><span data-t="historyLabel"></span></summary>
          <div class="ln-det-inner">
            <div class="ln-hist-list"></div>
            <button class="ln-link" type="button" data-act="hist-clear" data-t="historyClear"></button>
          </div>
        </details>
      </div>

      <div class="ln-body" id="ln-pane-follow" role="tabpanel" aria-labelledby="ln-tab-follow" data-pane="follow" hidden>
        <div class="ln-mem" hidden>
          <div class="ln-mem-title" data-t="memTitle"></div>
          <p class="ln-hint" data-t="memBody"></p>
          <div class="ln-hint ln-mem-found" data-t="memFound"></div>
          <div class="ln-mem-quotes"></div>
        </div>
        <div class="ln-feedback">
          <div class="ln-l" data-t="feedbackDirectTitle"></div>
          <div class="ln-feedback-actions">
            <button class="ln-btn ln-btn-primary" type="button" data-act="focus-composer" data-t="feedbackDirectAction"></button>
            <button class="ln-link" type="button" data-act="repeat-context" hidden data-t="repeatContext"></button>
          </div>
        </div>
        <div class="ln-questions" hidden>
          <div class="ln-q-title" data-t="qTitle"></div>
          <p class="ln-hint" data-t="qIntro"></p>
          <div class="ln-q-list"></div>
          <button class="ln-btn ln-btn-primary" type="button" data-act="q-insert" data-t="qInsert"></button>
        </div>
        <button class="ln-link ln-follow-anyway" type="button" data-act="anyway" hidden data-t="followAnyway"></button>
        <div class="ln-follow-block">
          <p class="ln-hint ln-follow-intro"></p>
          <div class="ln-follow-head" hidden></div>
          <div class="ln-follow-list"></div>
          <button class="ln-link ln-follow-more" type="button" data-act="more" hidden></button>
          <button class="ln-link ln-drift-nudge" type="button" data-act="drift-move" hidden
                  data-t="driftNudge"></button>
        </div>
      </div>

      <div class="ln-body" id="ln-pane-move" role="tabpanel" aria-labelledby="ln-tab-move" data-pane="move" hidden>
        <div class="ln-mv-title" data-t="mvTitle"></div>
        <p class="ln-hint" data-t="mvIntro"></p>
        <div class="ln-mv-size"></div>
        <div class="ln-drift" hidden></div>

        <div class="ln-row">
          <div class="ln-l" data-t="mvCarry"></div>
          <div class="ln-toggles ln-mv-parts"></div>
        </div>

        <div class="ln-step">
          <button class="ln-btn ln-btn-primary" type="button" data-act="mv-request" data-t="mvStep1"></button>
          <div class="ln-hint" data-t="mvStep1Hint"></div>
        </div>
        <div class="ln-step">
          <button class="ln-btn" type="button" data-act="mv-collect" data-t="mvStep2"></button>
          <div class="ln-hint" data-t="mvStep2Hint"></div>
          <div class="ln-mv-wait" hidden data-t="mvWaiting"></div>
        </div>

        <div class="ln-mv-result" hidden>
          <div class="ln-result-head">
            <label class="ln-l" for="ln-mv-out" data-t="mvHandover"></label>
            <button class="ln-link" type="button" data-act="mv-discard" data-t="mvDiscard"></button>
          </div>
          <div class="ln-mv-note" data-t="mvGot"></div>
          <textarea id="ln-mv-out" class="ln-out" spellcheck="false"></textarea>
          <div class="ln-row">
            <label class="ln-l" for="ln-mv-next" data-t="mvNext"></label>
            <input type="text" id="ln-mv-next">
          </div>
          <div class="ln-step">
            <button class="ln-btn ln-btn-primary" type="button" data-act="mv-launch" data-t="mvStep3"></button>
            <div class="ln-hint" data-t="mvStep3Hint"></div>
          </div>
          <p class="ln-hint ln-mv-adds" data-t="mvAdds"></p>
        </div>
      </div>

      <div class="ln-body" id="ln-pane-later" role="tabpanel" aria-labelledby="ln-tab-later" data-pane="later" hidden>
        <div class="ln-hint" data-t="laterIntro"></div>
        <div class="ln-limit" hidden></div>
        <div class="ln-queue-list"></div>
        <div class="ln-queue-empty" data-t="laterEmpty"></div>
        <div class="ln-queue-foot">
          <button class="ln-link" type="button" data-act="queue-clear" data-t="laterClear"></button>
        </div>
      </div>

      <div class="ln-body" id="ln-pane-settings" role="tabpanel" aria-labelledby="ln-tab-settings" data-pane="settings" hidden>
        <div class="ln-settings-section">
          <div class="ln-settings-title" data-t="settingsAppearance"></div>
          <div class="ln-l" data-t="settingsTextSize"></div>
          <div class="ln-settings-sizes" role="group" data-t-label="settingsTextSize">
            <button type="button" class="ln-setting-size" data-size="small" data-t="settingsSizeSmall"></button>
            <button type="button" class="ln-setting-size" data-size="normal" data-t="settingsSizeNormal"></button>
            <button type="button" class="ln-setting-size" data-size="gross" data-t="settingsSizeLarge"></button>
            <button type="button" class="ln-setting-size" data-size="sehr" data-t="settingsSizeVeryLarge"></button>
            <button type="button" class="ln-setting-size" data-size="riesig" data-t="settingsSizeLargest"></button>
          </div>
        </div>
        <div class="ln-settings-section">
          <div class="ln-l" data-t="settingsColour"></div>
          <div class="ln-settings-colours" role="group" data-t-label="settingsColour">
            <button type="button" class="ln-setting-colour" data-accent="green" data-t-label="pAccentGreen"></button>
            <button type="button" class="ln-setting-colour" data-accent="blue" data-t-label="pAccentBlue"></button>
            <button type="button" class="ln-setting-colour" data-accent="violet" data-t-label="pAccentViolet"></button>
            <button type="button" class="ln-setting-colour" data-accent="rose" data-t-label="pAccentRose"></button>
            <button type="button" class="ln-setting-colour" data-accent="slate" data-t-label="pAccentSlate"></button>
          </div>
        </div>
        <label class="ln-chk ln-settings-page-layer">
          <input type="checkbox" id="ln-page-layer"><span data-t="settingsPageLayer"></span>
        </label>
        <button class="ln-link ln-settings-tour" type="button" data-act="intro-show" data-t="introShow"></button>
      </div>

      <div class="ln-toast" role="status" aria-live="polite"></div>`;
    root.appendChild(panel);

    const $ = (sel) => panel.querySelector(sel);
    els = {
      text: $('#ln-text'), kind: $('#ln-kind'), goals: $('.ln-goals'),
      aud: $('#ln-aud'), fmt: $('#ln-fmt'), inc: $('#ln-inc'), avo: $('#ln-avo'),
      ctx: $('#ln-ctx'), ex: $('#ln-ex'),
      scope: $('#ln-scope'), improve: $('#ln-improve'), sources: $('#ln-sources'),
      model: $('#ln-model'), modelNote: $('.ln-model-note'),
      ignoreMemory: $('#ln-ignorememory'),
      mem: $('.ln-mem'), memQuotes: $('.ln-mem-quotes'),
      details: $('details.ln-det-main'), detCount: $('.ln-det-count'),
      intro: $('.ln-intro'), introTabs: $('.ln-intro-tabs'),
      detached: $('.ln-detached'), detachedText: $('.ln-detached-text'),
      found: $('.ln-found'), check: $('.ln-check'),
      route: $('.ln-route'), grab: $('.ln-grab'),
      result: $('.ln-result'), resultUpdated: $('.ln-result-updated'), note: $('.ln-note'), out: $('#ln-out'),
      announce: null, status: $('.ln-status'),
      paste: $('.ln-paste'),
      queueList: $('.ln-queue-list'), queueEmpty: $('.ln-queue-empty'),
      queueFoot: $('.ln-queue-foot'), limit: $('.ln-limit'),
      parts: $('.ln-parts'), partsList: $('.ln-parts-list'),
      help: $('.ln-help'), helpList: $('.ln-help-list'), tennis: $('#ln-tennis'),
      compare: $('.ln-compare'), compareOpen: $('.ln-compare-open'),
      selfcheck: $('.ln-selfcheck-out'),
      adapted: $('.ln-adapted'),
      verdict: $('.ln-verdict'),
      caps: $('.ln-caps'), capsNote: $('.ln-caps-note'),
      understood: $('.ln-understood'), refineLink: $('.ln-refine-link'),
      hist: $('.ln-hist'), histList: $('.ln-hist-list'),
      questions: $('.ln-questions'), qList: $('.ln-q-list'),
      repeatContext: $('[data-act="repeat-context"]'),
      followIntro: $('.ln-follow-intro'), followHead: $('.ln-follow-head'),
      followList: $('.ln-follow-list'), followMore: $('.ln-follow-more'),
      followBlock: $('.ln-follow-block'), followAnyway: $('.ln-follow-anyway'),
      drift: $('.ln-drift'), driftNudge: $('.ln-drift-nudge'),
      toast: $('.ln-toast'),
      btnLocal: $('button[data-path="local"]'), btnModel: $('button[data-path="model"]'),
      mvSize: $('.ln-mv-size'), mvWait: $('.ln-mv-wait'), mvParts: $('.ln-mv-parts'), mvResult: $('.ln-mv-result'),
      mvOut: $('#ln-mv-out'), mvNext: $('#ln-mv-next'), pageLayer: $('#ln-page-layer'),
      panes: {
        prompt: $('[data-pane="prompt"]'),
        follow: $('[data-pane="follow"]'),
        move: $('[data-pane="move"]'),
        later: $('[data-pane="later"]'),
        settings: $('[data-pane="settings"]')
      }
    };

    els.announce = document.createElement('div');
    els.announce.className = 'ln-sr';
    els.announce.id = 'ln-announce';
    els.announce.setAttribute('role', 'status');
    els.announce.setAttribute('aria-live', 'polite');
    els.announce.setAttribute('aria-atomic', 'true');
    root.appendChild(els.announce);

    // The toast must outlive the panel being hidden — a `hidden` panel is
    // display:none, which would swallow the confirmation that fires as the
    // panel closes.
    root.appendChild(els.toast);

    panel.addEventListener('click', onPanelClick);
    wireDrag();
    els.goals.addEventListener('keydown', onGoalKeys);
    const tabs = panel.querySelector('.ln-tabs');
    if (tabs) tabs.addEventListener('keydown', onTabKeys);

    els.kind.addEventListener('change', () => {
      // Correcting the detected kind by hand is the clearest signal there is
      // that the keyword lists got it wrong on this sentence.
      if (!state.manualKind) bumpStats((st) => { st.overrode++; });
      state.manualKind = true;
      state.manualAtText = els.text.value;
      state.corrected = true;
      if (!state.manualGoal) { state.goal = E.detectGoal(els.text.value, els.kind.value); paintGoals(); }
      refresh();
      save();
      if (els.result && !els.result.hidden) doBuild();
    });

    els.text.addEventListener('input', debounced);
    els.text.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doBuild(); }
    });
    FIELDS.forEach(k => els[k].addEventListener('input', debounced));
    [els.scope, els.improve, els.sources, els.ignoreMemory].forEach(c => c.addEventListener('change', () => {
      if (c === els.improve) state.improveExplicit = true;
      refresh();
      save();
    }));
    /* Kept in settings rather than in the draft: it is how somebody wants
     * things explained to them, which does not change when they clear a
     * request, and it should still be on next week. */
    if (els.tennis) els.tennis.addEventListener('change', () => {
      state.tennis = els.tennis.checked;
      renderHelp();
      saveSettings();
      announce(t().tennisToggle);
    });
    els.model.addEventListener('change', () => {
      state.modelChoice = els.model.value;
      refresh(); save();
    });
    if (els.pageLayer) els.pageLayer.addEventListener('change', () => {
      state.pageLayer = els.pageLayer.checked;
      state.pageLayer ? enablePage() : disablePage();
      savePanelSettings();
    });

    // Read the picker before the first render, or the note claims the model is
    // unrecognised until the user happens to type something.
    state.model = detectModel();
    applyLang();
    redetect();
    refresh();
  }

  function debounced() {
    clearTimeout(inputTimer);
    /* A new request is a new verdict. Carrying the override across would mean
     * one deliberate „anyway" silently turned the frame back on for good. */
    state.forceFull = false;
    state.leanPrompt = false;
    state.askFirst = false;
    inputTimer = setTimeout(() => { redetect(); refresh(); save(); }, 260);
  }

  function onPanelClick(e) {
    const b = e.target.closest('[data-act], [data-lang], [data-goal], [data-cap], [data-tab], [data-size], [data-accent], [data-follow], [data-field], [data-hist], [data-part]');
    if (b && b.dataset.part !== undefined) return;   // checkbox handles itself
    if (!b) return;

    if (b.dataset.tab) { setTab(b.dataset.tab); return; }
    if (b.dataset.lang) {
      state.manualLang = true; state.lang = b.dataset.lang;
      applyLang(); refresh(); save(); return;
    }
    if (b.dataset.size) { setTextSize(b.dataset.size); return; }
    if (b.dataset.accent) { setAccent(b.dataset.accent); return; }
    if (b.dataset.cap) { toggleCap(b.dataset.cap); return; }
    if (b.dataset.goal) {
      if (!state.manualGoal && b.dataset.goal !== state.goal) bumpStats((st) => { st.overrode++; });
      state.manualGoal = true; state.goal = b.dataset.goal;
      state.manualAtText = els.text.value;
      /* A correction is the user telling Lantern it got the kind of request
       * wrong, which is information Lantern did not have a moment ago. It
       * counts as an explicit choice for the same reason a filled-in field
       * does — see `explicit` in engine.js — and, like a field, it cannot
       * overrule a missing source or an action a chat cannot perform. */
      state.corrected = true;
      paintGoals(); refresh(); save();
      /* And it has to change the thing it corrects. Without this the strip
       * that invites the correction sits above a result that never moves,
       * which reads as a dead control. */
      if (els.result && !els.result.hidden) doBuild();
      return;
    }
    if (b.dataset.follow !== undefined) { insertFollowUp(b.dataset.follow); return; }
    if (b.dataset.field) { jumpToField(b.dataset.field); return; }
    if (b.dataset.hist !== undefined) { restoreHistory(Number(b.dataset.hist)); return; }

    switch (b.dataset.act) {
      case 'close': close(); break;
      case 'build': doBuild(); break;
      case 'refine': doRefine(); break;
      case 'copy': doCopy(); break;
      case 'insert': doInsert(); break;
      case 'expand': state.forceFull = true; state.leanPrompt = false; openDetails(); doBuild(); break;
      case 'shrink': state.forceFull = false; doBuild(); break;
      case 'lean': state.leanPrompt = true; state.forceFull = false; doBuild(); break;
      case 'usecap': if (b.dataset.capId) { toggleCap(b.dataset.capId); doBuild(); } break;
      case 'addcontext': jumpToField('context'); break;
      case 'askfirst': state.askFirst = !state.askFirst; doBuild(); break;
      case 'newchat': doNewChat(); break;
      case 'clear': doClear(); break;
      case 'grab': doGrab(); break;
      case 'more': state.showAllFollowUps = !state.showAllFollowUps; renderFollowUps(); break;
      case 'anyway': state.showFollowAnyway = true; renderFollowUps(); break;
      case 'q-insert': insertAnswers(); break;
      case 'focus-composer': focusComposer(); break;
      case 'repeat-context': repeatTaskContext(); break;
      case 'intro-ok': state.introSeen = true; els.intro.hidden = true; saveSettings(); break;
      case 'intro-show':
        setTab('prompt');
        els.intro.hidden = false;
        renderIntroTabs();
        els.intro.scrollIntoView({ behavior: motion(), block: 'start' });
        break;
      case 'hist-clear': state.history = []; renderHistory(); saveHistory(); break;
      case 'help': openHelp(); break;
      case 'selfcheck': runSelfCheck(); break;
      case 'help-close': closeHelp(); break;
      case 'part-add': addPart(); break;
      case 'queue-add': queueAdd(); break;
      case 'queue-clear': state.queue = []; renderQueue(); saveQueue(); break;
      case 'parts-clear':
        state.parts = []; state.collecting = false;
        renderParts(); refresh(); save(); break;
      case 'mv-request': doHandoverRequest(); break;
      case 'mv-collect': doHandoverCollect(); break;
      case 'mv-launch': doHandoverLaunch(); break;
      case 'compare': toggleCompare(); break;
      case 'drift-move': setTab('move'); break;
      /* The only fix for a detached content script is a fresh page. Lantern
       * does the reload rather than telling someone who does not know what F5
       * is to press F5. */
      case 'reload': try { location.reload(); } catch (e) {} break;
      case 'mv-discard': state.handover = ''; state.mvWaiting = 0; els.mvOut.value = ''; renderMove(); saveHandover(); break;
    }
  }

  /* Goal chips are a radiogroup, so arrow keys must move between them and only
   * the selected chip may be a tab stop. */
  function onGoalKeys(e) {
    const chips = Array.from(els.goals.querySelectorAll('[data-goal]'));
    if (!chips.length) return;
    let i = chips.findIndex(c => c.dataset.goal === state.goal);
    if (i < 0) i = 0;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % chips.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + chips.length) % chips.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = chips.length - 1;
    if (next === null) return;
    e.preventDefault();
    state.manualGoal = true;
    state.goal = chips[next].dataset.goal;
    state.manualAtText = els.text.value;
    state.corrected = true;
    paintGoals();
    chips[next].focus();
    refresh();
    save();
    if (els.result && !els.result.hidden) doBuild();
  }

  function onTabKeys(e) {
    const tabs = Array.from(panel.querySelectorAll('.ln-tab'));
    const current = e.target && typeof e.target.closest === 'function'
      ? e.target.closest('.ln-tab') : e.target;
    const index = tabs.indexOf(current);
    if (index < 0) return;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    setTab(tabs[next].dataset.tab);
    tabs[next].focus();
  }

  function setTab(name) {
    state.tab = name;
    dropScans();
    panel.querySelectorAll('.ln-tab').forEach(b => {
      const on = b.dataset.tab === name;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    els.panes.prompt.hidden = name !== 'prompt';
    els.panes.follow.hidden = name !== 'follow';
    els.panes.move.hidden = name !== 'move';
    els.panes.later.hidden = name !== 'later';
    els.panes.settings.hidden = name !== 'settings';
    if (name === 'follow') { onAnswerChanged(); renderFollowUps(); }
    if (name === 'move') { onAnswerChanged(); renderMove(); }
    if (name === 'later') { renderQueue(); renderLimit(); }
  }

  function jumpToField(check) {
    const id = FIELD_OF_CHECK[check];
    if (!id) { els.text.focus(); return; }
    els.details.open = true;
    const el = els[id];
    el.scrollIntoView({ behavior: motion(), block: 'center' });
    el.focus();
  }

  /* A manual choice should not outlive the request it was made for. */
  function clearStaleOverrides() {
    if (!state.manualKind && !state.manualGoal) return;
    const now = els.text.value.trim();
    if (!now) { state.manualKind = state.manualGoal = state.corrected = false; state.manualAtText = ''; return; }
    const before = (state.manualAtText || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!before.length) return;
    const nowSet = new Set(now.toLowerCase().split(/\s+/));
    const kept = before.filter(w => nowSet.has(w)).length / before.length;
    if (kept < 0.4) { state.manualKind = state.manualGoal = state.corrected = false; state.manualAtText = ''; }
  }

  /* The request box wins when it has enough text; otherwise the conversation
   * the user is standing in decides, and only then the browser locale. */
  function autoLang() {
    const fromChat = state.answerText
      ? E.detectLanguage(state.answerText, state.lang)
      : state.lang;
    return E.detectLanguage(els.text.value, fromChat);
  }

  function redetect() {
    clearStaleOverrides();
    const text = els.text.value;
    if (!state.manualLang) {
      const guess = autoLang();
      if (guess !== state.lang) { state.lang = guess; applyLang(); }
    }
    if (!state.manualKind) els.kind.value = E.detectArchetype(text);
    if (!R().goals.some(g => g.id === state.goal)) state.manualGoal = false;
    if (!state.manualGoal) state.goal = E.detectGoal(text, els.kind.value);
    paintGoals();
  }

  function paintGoals() {
    /* Nothing to correct before there is something to be wrong about. */
    if (els.understood) els.understood.hidden = !els.text.value.trim();
    els.goals.querySelectorAll('[data-goal]').forEach(b => {
      const on = b.dataset.goal === state.goal;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('on', on);
    });
  }

  /* ------------------------------------------------------------ capabilities
   *
   * All three assistants can do things a chat message alone does not get you,
   * and almost nobody this is for knows they exist, let alone where the control
   * is. That is the brief in one sentence, so the row sits under the box rather
   * than behind a fold.
   *
   * What it does NOT do is press the control. Three reasons, in order of how
   * much they matter: deep research is metered by the month on ChatGPT and by
   * the day on Gemini, so switching it on for somebody spends something of
   * theirs; a wrong match would be clicking an unknown control in a stranger's
   * account; and the person who pressed the button themselves knows where it is
   * next time, which is the entire point of the tool.
   *
   * So: the request is worded for it, the panel says where the control is, and
   * the in-page layer rings it if it can find it. */
  function capsFor() {
    const C = R().capabilities;
    if (!C || !C.list) return [];
    const pid = state.provider && state.provider.id;
    const where = (C.where && C.where[pid]) || {};
    const labels = (C.labels && C.labels[state.lang]) || {};
    return C.list.map(id => ({
      id: id,
      label: labels[id] || id,
      how: (where[id] && where[id].how) || 'ask',
      meter: !!(where[id] && where[id].meter),
      note: (where[id] && where[id][state.lang]) || '',
      what: ((C.what && C.what[state.lang]) || {})[id] || ''
    }));
  }

  function renderCaps() {
    if (!els.caps) return;
    const list = capsFor();
    els.caps.textContent = '';
    if (!list.length) { els.capsNote.hidden = true; return; }
    list.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ln-cap';
      b.dataset.cap = c.id;
      const on = (state.caps || []).indexOf(c.id) !== -1;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-disabled', String(c.how === 'none'));
      b.classList.toggle('on', on);
      /* Not hidden and not removed: „Claude erzeugt keine Bilder" is one of the
       * more useful things a beginner can learn here, and it can only be
       * learned from something they can see. */
      if (c.how === 'none') {
        b.classList.add('ln-cap-no');
        b.disabled = false;
        b.title = c.note || c.what || '';
      }
      b.textContent = c.label;
      els.caps.appendChild(b);
    });
    renderCapsNote();
  }

  function renderCapsNote() {
    if (!els.capsNote) return;
    const list = capsFor();
    /* One note at a time, for the one most recently touched. Five explanations
     * stacked under five chips is the thing this whole version is undoing. */
    const id = state.capNote || (state.caps || [])[(state.caps || []).length - 1];
    const c = id && list.find(x => x.id === id);
    if (!c) { els.capsNote.hidden = true; els.capsNote.textContent = ''; return; }
    els.capsNote.textContent = '';
    const L = t();
    const what = document.createElement('p');
    what.className = 'ln-cap-what';
    what.textContent = c.what;
    els.capsNote.appendChild(what);
    const where = document.createElement('p');
    where.className = 'ln-cap-where';
    where.textContent = (c.how === 'none' ? '' : L.capWhere + ' ') + c.note;
    els.capsNote.appendChild(where);
    if (c.meter) {
      const cost = document.createElement('p');
      cost.className = 'ln-cap-cost';
      cost.textContent = L.capMeter;
      els.capsNote.appendChild(cost);
    }
    els.capsNote.hidden = false;
  }

  function toggleCap(id) {
    const list = capsFor();
    const c = list.find(x => x.id === id);
    state.capNote = id;
    /* Something the assistant cannot do is still worth explaining, so the chip
     * answers — it just does not switch on. */
    if (c && c.how === 'none') { renderCaps(); return; }
    state.caps = state.caps || [];
    const i = state.caps.indexOf(id);
    if (i === -1) state.caps.push(id); else state.caps.splice(i, 1);
    renderCaps();
    refresh();
    refreshPage();
    save();
  }

  function followUpsList() {
    const r = R();
    const all = (r.followUps && r.followUps.length) ? r.followUps : (window.LN_RULES.followUps || []);
    /* The same filter rankFollowUps applies, and it has to be the same one:
     * ranked entries carry an index into this list, so filtering in one place
     * and not the other silently hands back the wrong card. */
    const pid = state.provider && state.provider.id;
    return all.filter(f => !f.only || (pid && f.only.indexOf(pid) !== -1));
  }

  /* One call after any change. */
  function refresh() {
    const s = collect(true);
    state.routing = s.text ? E.route(s) : null;
    state.usefulness = s.text && E.assessUse ? E.assessUse(s) : null;
    renderRouting();
    renderModel();
    renderFound(s);
    renderParts(s.text ? E.extract(s.text, state.lang) : null);
    renderChecklist(s);
    renderDetailCount();
    // On the same beat as everything else, so the diagnostic never shows an
    // older reading of the page than the panel around it.
    if (state.selfCheckOn && els.help && !els.help.hidden) renderSelfCheck();
    if (s.text && els.result && !els.result.hidden) doBuild(true);
  }

  /* What the five tabs are, spelled out once.
   *
   * The labels come from the tabs themselves rather than a second copy of the
   * same strings, so a renamed tab cannot end up described under its old name.
   * Built with DOM calls and not innerHTML because every one of these strings
   * is replaceable through the hosted rules channel, and text that can arrive
   * from a URL must never be parsed as markup. */
  function renderIntroTabs() {
    if (!els.introTabs) return;
    const L = t();
    const rows = [
      ['prompt', L.introTabPromptWhat],
      ['follow', L.introTabFollowWhat],
      ['move', L.introTabMoveWhat],
      ['later', L.introTabLaterWhat],
      ['settings', L.introTabSettingsWhat]
    ];
    els.introTabs.innerHTML = '';
    rows.forEach(([id, what]) => {
      const tab = panel.querySelector('.ln-tab[data-tab="' + id + '"]');
      const name = (tab ? tab.textContent : id).trim();
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = name;
      li.appendChild(b);
      li.appendChild(document.createTextNode(' - ' + (what || '')));
      els.introTabs.appendChild(li);
    });
  }

  /* What the engine read out of the sentence itself. Shown so that nothing the
   * prompt does is a surprise — auto-detection the user cannot see is worse
   * than no auto-detection at all. */
  function renderFound(s) {
    if (!s.text) { els.found.hidden = true; return; }
    const x = E.extract(s.text, state.lang);
    const L = (R().extractLabels || {})[state.lang] || {};
    const bits = [];
    if (x.length && !s.format) bits.push([L.length, x.length]);
    if (x.audience && !s.audience) bits.push([L.audience, x.audience]);
    if (x.tone) bits.push([L.tone, x.tone]);
    if (x.figures.length) bits.push([L.figures, x.figures.slice(0, 3).join(', ')]);
    if (x.questions.length) bits.push([L.questions, String(x.questions.length)]);
    if (x.material) bits.push([L.material, null]);
    if (x.promptish) bits.push([L.promptish, null]);
    if (!bits.length) { els.found.hidden = true; return; }

    els.found.innerHTML = '';
    const lead = document.createElement('span');
    lead.className = 'ln-found-lead';
    lead.textContent = t().detected + ': ';
    els.found.appendChild(lead);
    bits.forEach((b, i) => {
      const chip = document.createElement('span');
      chip.className = 'ln-found-chip';
      chip.textContent = b[1] ? b[0] + ' „' + b[1] + '“' : b[0];
      els.found.appendChild(chip);
      if (i < bits.length - 1) els.found.appendChild(document.createTextNode(' '));
    });
    els.found.hidden = false;
  }

  /* Only what is still missing gets named. Five pills, four of them ticked,
   * is noise; one line saying "still open: format, example" is a next step. */
  /* Collecting instead of splitting.
   *
   * "I'll explain more in the next message" is a workaround for a small text
   * box, and it makes the answer worse: the model starts reasoning about half
   * a problem, and by the time the rest arrives it has already committed to a
   * reading. Lantern already detected that intent and told ChatGPT to wait.
   * This is the other half — collect the pieces here, send one message. It is
   * exactly what an experienced user does by hand, which is the whole point of
   * the tool.
   *
   * The collector appears when the user says more is coming, or once they have
   * started collecting. It is never in the way of someone who does not need it. */
  function renderParts(x) {
    const L = t();
    /* Sticky on purpose. The signal is in the *first* sentence — "I'll send
     * more in a moment" — and the moment the user starts typing part one, that
     * sentence is gone. Keyed to the current text, the collector would vanish
     * exactly when it is needed, so once offered it stays until the parts are
     * discarded. */
    if (x && x.continues) state.collecting = true;
    const show = state.parts.length > 0 || state.collecting;
    els.parts.hidden = !show;
    // Emptied before the early return, not after: hiding the block while
    // leaving its rows in the DOM means discarded parts come back the next time
    // it is shown.
    els.partsList.innerHTML = '';
    if (!show) return;
    state.parts.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'ln-part';

      const num = document.createElement('span');
      num.className = 'ln-part-n';
      num.textContent = String(i + 1);

      const prev = document.createElement('span');
      prev.className = 'ln-part-text';
      // The first line is what the user recognises it by; the count is what
      // tells them it all arrived.
      prev.textContent = p.replace(/\s+/g, ' ').slice(0, 70) + (p.length > 70 ? '…' : '');
      prev.title = p.slice(0, 400);

      const n = document.createElement('span');
      n.className = 'ln-part-count';
      n.textContent = L.partsWords.replace('{n}', String(p.split(/\s+/).filter(Boolean).length));

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'ln-part-x';
      del.setAttribute('aria-label', L.partsRemove.replace('{n}', String(i + 1)));
      del.textContent = '×';
      del.addEventListener('click', () => {
        state.parts.splice(i, 1);
        renderParts(x);
        refresh();
        save();
      });

      row.appendChild(num);
      row.appendChild(prev);
      row.appendChild(n);
      row.appendChild(del);
      els.partsList.appendChild(row);
    });

    const clear = els.parts.querySelector('[data-act="parts-clear"]');
    if (clear) clear.hidden = !state.parts.length;
  }

  function addPart() {
    const v = els.text.value.trim();
    if (!v) { toast(t().inputEmpty); els.text.focus(); return; }
    state.parts.push(v);
    els.text.value = '';
    els.text.focus();
    // The request box is now empty on purpose; detection has to follow.
    redetect();
    renderParts(null);
    refresh();
    save();
    announce(t().partsAdded.replace('{n}', String(state.parts.length)));
    toast(t().partsAdded.replace('{n}', String(state.parts.length)));
  }

  /* --------------------------------------------------------------- help
   *
   * The brief: someone who reads this should afterwards be able to do it
   * without the tool. That rules out a feature tour — "press Build prompt to
   * build a prompt" teaches nobody anything — so every card answers a question
   * a beginner actually asks, gives the *reason*, and ends with the technique
   * in one line they could type themselves.
   *
   * Closed by default, one click from the header, and it covers the body
   * rather than pushing it down, so opening it never costs you your place.
   */
  /* ------------------------------------------------- moving and resizing
   *
   * Feedback from the first real user: the panel "is stuck on the right instead
   * of being free of a box". They were right — it was welded to the full height
   * of the right edge, which reads as part of the page rather than a tool you
   * are holding, and on a wide screen it wasted most of its own height.
   *
   * Dragged by the header, resized from any of the four corners, clamped so it
   * can never be dropped somewhere it cannot be grabbed back from, and
   * remembered. Pointer events rather than mouse events, so a trackpad or a
   * touchscreen works too.
   *
   * It was one corner (bottom-left) for a while, on the reasoning that the
   * bottom-right one would sit off-screen at the default right-anchored
   * position. That reasoning was about the *default* position and stopped being
   * true the moment anyone moved the panel, which is the first thing people do.
   * Four corners also means the two that grow upward exist at all: with only a
   * bottom grip, a panel near the bottom of the screen could be made shorter
   * but never taller, because the bottom edge was already against the clamp.
   */
  const MIN_W = 320, MIN_H = 260;

  function applyBox(box) {
    if (!panel || !box) return;
    // Clamped on apply, not just on drop: a window that has since been made
    // smaller must not strand the panel off the edge.
    const vw = Math.max(1, window.innerWidth || 0);
    const vh = Math.max(1, window.innerHeight || 0);
    const maxW = Math.max(1, vw - 16);
    const maxH = Math.max(1, vh - 16);
    const requestedW = typeof box.w === 'number' ? box.w : 468;
    const requestedH = typeof box.h === 'number' ? box.h : vh - 32;
    const w = Math.max(Math.min(MIN_W, maxW), Math.min(requestedW, maxW));
    const h = Math.max(Math.min(MIN_H, maxH), Math.min(requestedH, maxH));
    const gapX = Math.min(8, Math.max(0, (vw - w) / 2));
    const gapY = Math.min(8, Math.max(0, (vh - h) / 2));
    const maxLeft = Math.max(gapX, vw - w - gapX);
    const maxTop = Math.max(gapY, vh - h - gapY);
    const left = Math.max(gapX, Math.min(
      typeof box.left === 'number' ? box.left : maxLeft,
      maxLeft
    ));
    const top = Math.max(gapY, Math.min(
      typeof box.top === 'number' ? box.top : gapY,
      maxTop
    ));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.width = w + 'px';
    panel.style.height = h + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    placeFab();
  }

  function currentBox() {
    const r = panel.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  }

  function saveBox() {
    if (!panel || panel.hidden) return;
    state.box = currentBox();
    state.settingsRaw = Object.assign({}, state.settingsRaw || {}, { box: state.box });
    STORE.set({ lnSettings: state.settingsRaw });
  }

  function startDrag(e, mode) {
    if (e.button !== undefined && e.button !== 0) return;
    const start = currentBox();
    const x0 = e.clientX, y0 = e.clientY;
    const target = e.currentTarget || e.target || panel;
    const pointerId = e.pointerId;
    let captured = false;
    let finished = false;
    panel.dataset.dragging = '1';
    // Applied before the first move so a drag that begins at the default
    // right-anchored position does not jump.
    applyBox(start);

    try {
      if (target && typeof target.setPointerCapture === 'function' && pointerId !== undefined) {
        target.setPointerCapture(pointerId);
        captured = true;
      }
    } catch (e2) {}

    const samePointer = (ev) => pointerId === undefined || ev.pointerId === undefined || ev.pointerId === pointerId;

    const move = (ev) => {
      if (!samePointer(ev)) return;
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (mode === 'move') {
        applyBox({ left: start.left + dx, top: start.top + dy, w: start.w, h: start.h });
      } else {
        /* Resizing from a corner. The two edges the grip does NOT touch stay
         * exactly where they are, which is what makes a corner drag feel like
         * a corner drag; the moving edges are expressed as a change of
         * left/top so that the anchored ones come out unchanged.
         *
         * `mode` is the compass corner: 'nw', 'ne', 'se', 'sw'. */
        const west = mode.indexOf('w') !== -1;
        const north = mode.indexOf('n') !== -1;
        const w = Math.max(MIN_W, west ? start.w - dx : start.w + dx);
        const h = Math.max(MIN_H, north ? start.h - dy : start.h + dy);
        applyBox({
          left: west ? start.left + (start.w - w) : start.left,
          top: north ? start.top + (start.h - h) : start.top,
          w: w, h: h
        });
      }
      if (ev.preventDefault) ev.preventDefault();
    };
    const finish = (ev) => {
      if (finished || (ev && !samePointer(ev))) return;
      finished = true;
      panel.dataset.dragging = '';
      if (target && target.removeEventListener) {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', finish);
        target.removeEventListener('pointercancel', finish);
        target.removeEventListener('lostpointercapture', finish);
      }
      if (!captured) {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
      }
      if (captured && target && typeof target.releasePointerCapture === 'function' && pointerId !== undefined) {
        try { target.releasePointerCapture(pointerId); } catch (e2) {}
      }
      saveBox();
      try { if (window.LN_INPAGE && window.LN_INPAGE.isOn()) refreshPage(); } catch (e2) {}
    };
    if (target && target.addEventListener) {
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', finish);
      target.addEventListener('pointercancel', finish);
      target.addEventListener('lostpointercapture', finish);
    }
    if (!captured) {
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    }
  }

  function wireDrag() {
    const head = panel.querySelector('.ln-head');
    if (head) head.addEventListener('pointerdown', (e) => {
      // The buttons in the header are controls, not a handle.
      if (e.target.closest('button, select, input, .ln-lang')) return;
      startDrag(e, 'move');
    });
    panel.querySelectorAll('.ln-grip').forEach((grip) => {
      grip.addEventListener('pointerdown', (e) => startDrag(e, grip.dataset.corner || 'sw'));
    });

    // A window resize can strand a remembered position off-screen.
    /* placeFab regardless: with no stored box the panel is positioned by CSS,
     * so applyBox does not run and the handle would keep the left it had at
     * the old window width. */
    window.addEventListener('resize', () => {
      if (state.box) applyBox(state.box);
      else placeFab();
      refreshPage();
    });
  }

  /* ---------------------------------------------------------------- later
   *
   * You hit a limit, you still have things to say, and by the time the limit is
   * back you have forgotten two of them. So: write them now, keep them here,
   * and send them when you can.
   *
   * THE LINE THIS FEATURE DOES NOT CROSS: Lantern never sends them. It hands
   * each one back into the composer on a click and you press enter. That is not
   * a missing convenience, it is the reason the feature is allowed to exist —
   * all three providers prohibit automated access to their services, and a
   * program that submits messages while nobody is at the keyboard is exactly
   * that, however politely it waits for a quota to roll over. The behavioural
   * signature (a message at the exact second a window resets, from a session
   * with no input events) is precisely what gets accounts flagged, and a ban
   * would be the inversion of everything this tool is for.
   *
   * So the tab says so in as many words, and there is no code path here that
   * could send anything even if someone asked for one. */
  function saveQueue() {
    STORE.set({ lnQueue: state.queue });
  }

  function queueAdd() {
    const text = (els.out.value || '').trim() || (els.text.value || '').trim();
    if (!text) { toast(t().inputEmpty); return; }
    if (state.queue.some(q => q.text === text)) { toast(t().queueDupe); return; }
    state.queue.unshift({
      text: text,
      note: (els.text.value || '').trim().slice(0, 120),
      provider: state.provider ? state.provider.id : null,
      ts: Date.now()
    });
    if (state.queue.length > 20) state.queue.length = 20;
    renderQueue();
    saveQueue();
    toast(t().queueAdded(state.queue.length));
    updateBadge();
  }

  function renderQueue() {
    const L = t();
    if (!els.queueList) return;
    els.queueList.innerHTML = '';
    els.queueEmpty.hidden = state.queue.length > 0;
    els.queueFoot.hidden = state.queue.length === 0;

    state.queue.forEach((q, i) => {
      const row = document.createElement('div');
      row.className = 'ln-q';

      const head = document.createElement('div');
      head.className = 'ln-q-head';
      const n = document.createElement('span');
      n.className = 'ln-q-n';
      n.textContent = String(i + 1);
      const when = document.createElement('span');
      when.className = 'ln-q-when';
      when.textContent = q.ts ? new Date(q.ts).toLocaleString(state.lang === 'de' ? 'de-DE' : 'en-GB',
        { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      head.appendChild(n);
      head.appendChild(when);

      const prev = document.createElement('div');
      prev.className = 'ln-q-text';
      prev.textContent = (q.note || q.text).replace(/\s+/g, ' ').slice(0, 150);
      prev.title = q.text.slice(0, 500);

      const acts = document.createElement('div');
      acts.className = 'ln-q-acts';

      /* The only send-shaped control in the feature, and it does not send: it
       * puts the text where your cursor would put it. */
      const ins = document.createElement('button');
      ins.type = 'button';
      ins.className = 'ln-btn ln-btn-sm ln-btn-primary';
      ins.textContent = L.queueInsert;
      ins.addEventListener('click', () => {
        if (insertIntoComposer(q.text)) toast(L.queueInserted);
        else { writeClipboard(q.text); toast(L.clipboardFallback); }
      });

      const cp = document.createElement('button');
      cp.type = 'button';
      cp.className = 'ln-link';
      cp.textContent = L.copy;
      cp.addEventListener('click', () => { writeClipboard(q.text); toast(L.copied); });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'ln-link';
      del.textContent = L.queueDone;
      del.setAttribute('aria-label', L.queueDoneOne.replace('{n}', String(i + 1)));
      del.addEventListener('click', () => {
        state.queue.splice(i, 1);
        renderQueue(); saveQueue(); updateBadge();
      });

      acts.appendChild(ins); acts.appendChild(cp); acts.appendChild(del);
      row.appendChild(head); row.appendChild(prev); row.appendChild(acts);
      els.queueList.appendChild(row);
    });
  }

  /* Has the page said you are out of messages?
   *
   * Read from the page's own words, not guessed from behaviour. Anthropic
   * publishes the exact strings ("Approaching 5-hour limit", "5-hour limit
   * reached - resets [time]"), and the reset time is inside the string, which
   * is the useful part — it turns "later" into a time. */
  /* Reset times, in the shapes the three of them actually use. Absolute clock
   * times in both 12- and 24-hour form, and the dated form Gemini used before
   * it changed schemes ("until Sep 10, 5:17 PM", "until 25 Sept, 17:36"). The
   * locale matters: a fixed AM/PM pattern would never match for the German
   * users this is largely built for. */
  const TIME_SHAPES = [
    /\b(\d{1,2}[:.]\d{2}(?:\s?[ap]\.?m\.?)?)/i,
    /\b(\d{1,2}\.?\s?(?:Jan|Feb|M(?:ar|är)|Apr|Ma[iy]|Jun|Jul|Aug|Sep|O[kc]t|Nov|De[czk])[a-zä]*\.?(?:,?\s?\d{1,2}[:.]\d{2})?)/i
  ];

  /* Where on the page a phrase was found — and, crucially, whether it was in a
   * banner or inside a message.
   *
   * THE BUG THIS EXISTS TO FIX: the previous version searched
   * document.body.innerText, which includes the conversation. So if a user
   * asked "what happens when I hit my usage limit?", the assistant's own
   * answer put those exact words on the page and Lantern told the user they
   * were rate-limited. That is not a missed warning, it is a confident wrong
   * one — the expensive kind — and it was reachable by asking a perfectly
   * ordinary question.
   *
   * Text nodes are walked instead of the flattened string so that each hit can
   * be traced back to an element and rejected if it sits inside a message, or
   * inside anything Lantern itself put on the page. */
  /* Nodes whose text is not text the user can see.
   *
   * THIS LIST EXISTS BECAUSE OF A REAL LEAK. The self-check's limit probe
   * walked every text node on the page, and on chatgpt.com the word "limit"
   * appears inside a <script> tag carrying the signed-in session — so the
   * report, which is designed to be copied and sent to somebody for support,
   * came back containing the user's account id and email address. It was
   * pasted into a chat before anyone noticed.
   *
   * A page scan must never see anything the reader cannot. That is the whole
   * rule, and it is cheap to keep. */
  const UNREADABLE = 'SCRIPT,STYLE,NOSCRIPT,TEMPLATE,IFRAME,OBJECT,CANVAS,SVG,HEAD,TITLE,META,LINK';

  function findOutsideMessages(needles) {
    const p = state.provider;
    const msgSel = (p && p.dom && p.dom.message) || null;
    let walker;
    try {
      walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          const par = n.parentElement;
          if (!par) return NodeFilter.FILTER_REJECT;
          if (UNREADABLE.indexOf(par.tagName) !== -1) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
    } catch (e) { return null; }

    let node, scanned = 0;
    while ((node = walker.nextNode())) {
      if (++scanned > 6000) break;              // a bounded scan beats a slow one
      const raw = node.nodeValue;
      if (!raw || raw.length < 8) continue;
      // Models type the curly apostrophe; the phrase lists use the straight one.
      const text = raw.replace(/[\u2018\u2019]/g, "'");
      const low = text.toLowerCase();
      const hit = needles.filter(n => low.indexOf(String(n).toLowerCase().replace(/[\u2018\u2019]/g, "'")) !== -1)[0];
      if (!hit) continue;

      const el = node.parentElement;
      if (!el) continue;
      try {
        if (el.closest('[data-ln]') || el.closest('#lantern-root')) continue;
        if (msgSel && el.closest(msgSel)) continue;   // it is the answer, not a banner
      } catch (e) { continue; }

      /* Only take text from an element the browser is actually painting.
       * `innerText` on a hidden container returns its markup text, which is
       * the other half of how the leak got out. */
      let around = '';
      try {
        const host = el.closest('div, section, aside, [role]') || el;
        const box = host.getBoundingClientRect();
        around = (box.width > 0 && box.height > 0) ? (host.innerText || text) : text;
      } catch (e) { around = text; }
      return {
        hit: hit,
        text: around.replace(/\s+/g, ' ').slice(0, 200),
        rawText: around.replace(/\s+/g, ' ')
      };
    }
    return null;
  }

  function firstTime(text) {
    for (const re of TIME_SHAPES) { const m = text.match(re); if (m) return m[1]; }
    return null;
  }

  /* Both page scans are cached for a moment.
   *
   * `findOutsideMessages` walks text nodes, and both callers sit on paths that
   * run while a reply is streaming — the drift check now runs on every
   * follow-up render, which is every 1.2 seconds during a long answer. Walking
   * a few thousand nodes that often on a long chat is exactly the kind of cost
   * a user experiences as "this page got slow" and never attributes to an
   * extension.
   *
   * The TTL is the backstop, not the mechanism. What actually keeps the answer
   * fresh is that the cache is dropped whenever the page changes (the same
   * debounced mutation callback that re-reads the answer) and whenever the user
   * switches tabs — a deliberate action, where being current matters and the
   * cost is one scan. So the stale window is only ever a page that is not
   * changing and a user who is not looking. */
  const scanCache = { limit: [0, null], ctx: [0, false] };
  const SCAN_TTL = 2000;
  function dropScans() { scanCache.limit = [0, null]; scanCache.ctx = [0, false]; }
  function cached(key, fn) {
    const now = Date.now();
    const hit = scanCache[key];
    if (hit && now - hit[0] < SCAN_TTL) return hit[1];
    const v = fn();
    scanCache[key] = [now, v];
    return v;
  }

  /* Have you run out of messages? */
  function detectLimit() { return cached('limit', detectLimitNow); }
  function detectLimitNow() {
    const p = state.provider;
    const lim = (p && p.limits) || {};
    const found = findOutsideMessages(lim.strings || []);
    if (!found) return null;
    const when = firstTime(found.text);
    /* Where the phrase itself is a guess — Gemini, whose current wording
     * nobody has published — the reset time is required as corroboration. One
     * unverified phrase is not enough to tell somebody they are locked out. */
    if (lim.requireTime && !when) return null;
    return { hit: found.hit, when: when, text: found.text };
  }

  /* Is this conversation too long for the model, which is a different problem
   * with a different fix — the handover, not the queue. */
  function detectContextFull() {
    return cached('ctx', function () {
      const p = state.provider;
      const lim = (p && p.limits) || {};
      return !!findOutsideMessages(lim.contextStrings || []);
    });
  }

  function renderLimit() {
    if (!els.limit) return;
    const lim = detectLimit();
    if (!lim) { els.limit.hidden = true; return; }
    const L = t();
    els.limit.textContent = lim.when
      ? L.limitHitAt.replace('{t}', lim.when)
      : L.limitHit;
    els.limit.hidden = false;
  }

  /* Is Lantern working on this page?
   *
   * This already existed — in the browser-toolbar popup. Two testers in a row
   * could not find it, which makes it worth nothing: a diagnostic nobody can
   * reach reports on a problem nobody can see. So it lives here too, one click
   * from the panel, and it runs in-process rather than over a message channel.
   *
   * It also prints the raw text it read from the model picker. Without that,
   * "Model not recognised" is a dead end for whoever has to fix it — with it,
   * the answer is right there in the report. */
  /* The last gate before anything reaches a report a person will paste to a
   * stranger.
   *
   * The walker no longer reads <script>, which is where the account JSON came
   * from. This is the second layer, and it exists because the first one was
   * also obviously sufficient right up until it was not: if a string looks
   * like structured data, a credential or an address, it does not go in the
   * report at all. Dropping a diagnostic line costs one round of debugging.
   * Publishing somebody's email costs something they cannot take back. */
  var UNSAFE = [
    /[\w.+-]+@[\w-]+\.[\w.]{2,}/,                 // an address of any kind
    /"[a-zA-Z_]+"\s*:/,                            // JSON
    /\b(authStatus|accessToken|access_token|idToken|session|bearer|apiKey|api_key|csrf|cookie)\b/i,
    /\b[A-Za-z0-9_-]{24,}\b/,                      // an id or a token
    /\bey[A-Za-z0-9_-]{10,}\./                     // a JWT
  ];
  function safeForReport(text) {
    const t = String(text || '');
    if (!t.trim()) return null;
    for (var i = 0; i < UNSAFE.length; i++) {
      if (UNSAFE[i].test(t)) return '(withheld: looked like account data)';
    }
    return t;
  }

  function safeReportExcerpt(text, limit) {
    const safe = safeForReport(text);
    return safe ? safe.slice(0, limit) : null;
  }

  function selfCheckFacts() {
    let answers = 0, users = 0;
    const p = state.provider;
    try {
      answers = document.querySelectorAll((p && p.dom.assistant) || '[data-message-author-role="assistant"]').length;
      users = document.querySelectorAll((p && p.dom.user) || '[data-message-author-role="user"]').length;
    } catch (e) {}

    /* What the picker says — and, when nothing matched, what *else* is on the
     * page that might be one.
     *
     * The first version reported `pickerText: ""` from a real ChatGPT account,
     * which said only "none of my selectors matched" and gave no way forward.
     * A diagnostic that can only report its own failure is half a diagnostic,
     * so when the model is unknown this lists the nearby candidates instead —
     * and the next report names the element rather than the absence. */
    /* Only a NAMED candidate may be quoted as "what the model button says".
     *
     * This took the first candidate of any kind, and on a real free ChatGPT
     * account that was the avatar: the report read
     * `pickerText: "Open profile menu"`, which says Lantern found the model
     * picker and it is the profile menu. It found no model picker, and that is
     * a different and more useful fact — on that account there is no model
     * picker, the person cannot see which model they are on either, and
     * `model: null` is the correct answer rather than a failure. */
    const cands = pickerCandidates();
    let seen = '';
    for (const c of cands) { if (c.named && c.both) { seen = c.both; break; } }
    const pickerFound = !!seen;

    /* Always, not only on failure.
     *
     * The previous version listed these only when no model was found — so when
     * a real account detected "Pro" from something that was not the picker at
     * all, the evidence that would have shown it was suppressed by the very
     * fact that it had "succeeded". A confident wrong answer is the failure
     * mode worth instrumenting, so the report now always carries where the
     * name came from. */
    const named = cands.filter(c => c.named).slice(0, 4)
      .map(c => safeReportExcerpt(c.both, 60)).filter(Boolean);
    /* Controls that might be the model picker — and only those.
     *
     * This used to sweep every button in the document, which on a real account
     * meant the report listed the titles of the user's own conversations out of
     * the sidebar: "Pin Muster Wohnraummietvertrag erstellen". Those are the
     * user's content, in a report built to be handed to somebody else.
     *
     * Navigation is excluded, message bodies are excluded, and the cap comes
     * down to 32 characters — a control label is short, a conversation title
     * usually is not. Each one is still passed through the same gate as
     * everything else. */
    let nearby = [];
    try {
      const pool = [];
      const msgSel = (p && p.dom && p.dom.message) || null;
      document.querySelectorAll('button, [role="button"], [role="combobox"]').forEach(el => {
        try {
          if (el.closest('nav, aside, [role="navigation"], [role="list"], #lantern-root, [data-ln]')) return;
          if (msgSel && el.closest(msgSel)) return;
        } catch (e2) { return; }
        const tx = ((el.getAttribute('aria-label') || '') + ' ' + (el.innerText || ''))
          .trim().replace(/\s+/g, ' ');
        if (!tx || tx.length < 2 || tx.length > 32) return;
        const safe = safeForReport(tx);
        if (safe && pool.indexOf(safe) === -1) pool.push(safe);
      });
      nearby = pool.slice(0, 12);
    } catch (e) {}

    /* Whether the LAST ANSWER was actually read, and what was made of it.
     *
     * Added after finding that four places in this file read ChatGPT's markup
     * on every site, so on Claude and Gemini no answer was ever found — and
     * nothing said so. The self-check reported "messages: 12" quite happily,
     * because that one counter had been written correctly, which is the exact
     * shape of a diagnostic that instruments only the path that already works.
     *
     * `answerWords: 0` next to `messages: 12` is now a visible contradiction,
     * and `signals` shows whether the reading produced anything usable. */
    const a = state.answer || {};
    const answerRead = {
      found: !!a.present,
      words: a.words || 0,
      signals: (a.signals || []).slice(0, 10),
      usingSelector: sel('assistant', '(default)')
    };

    /* Why the model was not recognised — the two halves of that question.
     *
     * A real ChatGPT account came back with `model: null` and
     * `pickerText: "Switch model"`. That report says the probe found the
     * picker and the picker said nothing, and then it stops: it does not say
     * whether the name was somewhere else on the page, or present under a name
     * this build has never heard of. Both are one sentence away and both are
     * actionable, and without them the next round is guesswork.
     *
     * So the report now carries what was looked FOR alongside what was FOUND.
     * If the names list is stale — a vendor renames its models roughly twice a
     * year — the fix is one line in providers.js, and this is the line that
     * says so. Nothing here is a verdict and nothing here reaches the user;
     * it is evidence for whoever reads the pasted report.
     *
     * Same privacy gate as everything else: `safeForReport` on every string,
     * navigation and message bodies excluded, short cap. The self-check once
     * carried a user's e-mail address into a report meant for strangers, and
     * every probe added since is written on the assumption that it will. */
    let lookedFor = [];
    try {
      ((p && p.tiers) || []).forEach(t => (t.names || []).forEach(n => lookedFor.push(n)));
    } catch (e) {}

    let modelArea = [];
    try {
      const pool = [];
      const msgSel = (p && p.dom && p.dom.message) || null;
      const seenTx = {};
      // Only things that announce themselves as being about the model, plus
      // the immediate surroundings of whatever the picker probe settled on.
      document.querySelectorAll(
        '[data-testid*="model" i], [aria-label*="model" i], [aria-label*="modell" i], [id*="model" i]'
      ).forEach(el => {
        try {
          if (el.closest('nav, aside, [role="navigation"], [role="list"], #lantern-root, [data-ln]')) return;
          if (msgSel && el.closest(msgSel)) return;
        } catch (e2) { return; }
        const tx = [
          el.tagName.toLowerCase(),
          el.getAttribute('data-testid') || '',
          el.getAttribute('aria-label') || '',
          (el.innerText || '').trim().replace(/\s+/g, ' ')
        ].filter(Boolean).join(' | ');
        const safe = safeReportExcerpt(tx, 120);
        if (safe && !seenTx[safe]) { seenTx[safe] = 1; pool.push(safe); }
      });
      for (const c of cands) {
        if (!c.named) continue;
        const near = safeReportExcerpt(aroundPicker(c), 90);
        if (near && !seenTx[near]) { seenTx[near] = 1; pool.push('around: ' + near); }
      }
      modelArea = pool.slice(0, 8);
    } catch (e) {}

    /* Deliberately over-inclusive, and deliberately not a verdict.
     *
     * Gemini's current limit wording is published nowhere — Google confirms in
     * its help pages that the notification exists and never quotes it — so the
     * phrase list for it is a guess with a reset time required beside it. This
     * reports anything limit-shaped sitting outside the conversation, so that
     * one self-check from someone who has actually hit a limit settles the
     * wording instead of another round of guessing.
     *
     * Being wrong here is free: it is a line in a report, not a warning shown
     * to a user. That is the difference between a probe and a feature. */
    let limitProbe = null;
    try {
      const near = findOutsideMessages(['limit', 'kontingent', 'quota', 'nutzungs']);
      if (near) limitProbe = safeReportExcerpt(near.rawText || near.text, 160);
    } catch (e) {}

    return {
      provider: p ? p.label : null,
      panel: !!panel,
      composer: !!composer(),
      messages: answers + users,
      /* Split out because "no answer was read" means two completely different
       * things depending on which of these is zero: a selector that missed, or
       * a chat nobody has answered in yet. The first is a fault, the second is
       * Tuesday. */
      answersSeen: answers,
      userMsgs: users,
      answer: answerRead,
      limitSeen: !!detectLimit(),
      limitProbe: limitProbe,
      storage: STORE.alive() ? (state.detached || 'ok') : 'detached',
      model: state.model ? cap(state.model) : null,
      effort: detectEffort(),
      pickerText: safeForReport(seen) || '',
      pickerFound: pickerFound,
      modelFrom: state.modelLabel || null,
      /* The two things the first outside reader said they could not verify.
       * Both were real features nobody could see working, which is the same as
       * a broken feature from the outside. */
      drift: driftFacts(),
      promptAdapted: (state.lastAdapted || []).map(a =>
        a.detail === undefined ? a.id : a.id + '=' + a.detail),
      modelLookedFor: lookedFor,
      modelArea: modelArea,
      namedPickers: named,
      candidates: cands.length,
      nearbyButtons: nearby,
      pageLayer: !!(window.LN_INPAGE && window.LN_INPAGE.isOn()),
      /* Work done on this page, since the tab was loaded. `wakes` is how often
       * a change looked like it might be an answer; `reads` is how often one
       * actually was. A large gap between them means the filter is earning its
       * keep; a large `reads` on a quiet page means something is wrong. */
      wakes: state.wakes || 0,
      reads: state.reads || 0,
      nodes: document.querySelectorAll('*').length
    };
  }

  /* Two things about this that came straight out of testing it on real
   * accounts, both of which made it lie:
   *
   * 1. IT WENT STALE AND LOOKED CURRENT. It rendered once, on the click, and
   *    then sat there. So the ordinary sequence — open the panel in a fresh
   *    chat, run the check, send a message, look back — showed the state of a
   *    chat that no longer existed, and the only way to find out was to know
   *    to press the button again. "You have to manually reload it by clicking
   *    again, which is annoying and misleading." Misleading is the word that
   *    matters: a diagnostic that shows an old reading confidently is worse
   *    than one that shows nothing. It now re-reads on the same beat as the
   *    rest of the panel and on its own timer while it is on screen.
   *
   * 2. IT CALLED AN EMPTY CHAT BROKEN. Two red ✗ against "messages readable"
   *    and "last answer read" in a chat that simply had no messages in it yet
   *    — which is what a new chat is, and is the state you are in when you go
   *    looking for a self-check in the first place. Nothing is wrong there and
   *    nothing is being reported: there is no answer to read. That is a third
   *    state, and it now has its own mark and its own words. A ✗ has to mean
   *    "this should have worked and did not", or it means nothing.
   */
  function renderSelfCheck() {
    const L = t();
    const d = selfCheckFacts();
    const box = els.selfcheck;
    box.hidden = false;
    box.innerHTML = '';

    /* `ok` is true / false / null, where null is "nothing to report yet".
     * Deliberately not folded into false. */
    const row = (label, ok, extra) => {
      const r = document.createElement('div');
      r.className = 'ln-check-row';
      const m = document.createElement('span');
      m.className = ok === null ? 'ln-na' : (ok ? 'ln-yes' : 'ln-no');
      m.textContent = ok === null ? '\u00b7' : (ok ? '\u2713' : '\u2717');
      const tx = document.createElement('span');
      tx.textContent = label + (extra ? ' ' : '');
      r.appendChild(m); r.appendChild(tx);
      if (extra) {
        const b = document.createElement('b');
        b.textContent = extra;
        r.appendChild(b);
      }
      box.appendChild(r);
      return r;
    };

    const emptyChat = d.messages === 0;
    // No answer *yet* is not a miss. A missed selector is: there are answers on
    // the page and none of them could be read.
    const noAnswerYet = d.answersSeen === 0;

    row(L.checkSite, !!d.provider, d.provider || '');
    row(L.checkComposer, d.composer);
    row(L.checkMessages, emptyChat ? null : true,
      emptyChat ? L.checkEmptyChat : String(d.messages));
    /* Separate from the message count on purpose. Counting messages and
     * reading the last one use different selectors, and the whole point of
     * this line is that one can work while the other silently does not. */
    row(L.checkAnswer, d.answer.found ? true : (noAnswerYet ? null : false),
      d.answer.found ? String(d.answer.words) + ' ' + L.checkWords
                     : (noAnswerYet ? L.checkNoAnswerYet : ''));
    row(L.checkModel, !!d.model, d.model || '');
    if (d.effort) row(L.checkEffort, true, cap(d.effort));
    row(L.checkPage, d.pageLayer);

    if (emptyChat || noAnswerYet) {
      const note = document.createElement('div');
      // Its own class, not ln-check-raw: that one is for text quoted off the
      // page, and mixing an explanation into it makes both harder to read.
      note.className = 'ln-check-note';
      note.textContent = L.checkNoteNothingYet;
      box.appendChild(note);
    }

    /* The line that makes a failure reportable rather than mysterious. */
    if (d.pickerText) {
      const raw = document.createElement('div');
      raw.className = 'ln-check-raw';
      raw.textContent = L.checkRaw + ' \u201c' + d.pickerText + '\u201d';
      box.appendChild(raw);
    } else if ((d.nearbyButtons || []).length) {
      const raw = document.createElement('div');
      raw.className = 'ln-check-raw';
      raw.textContent = L.checkNoPicker + ' ' + d.nearbyButtons.slice(0, 8).join(' \u00b7 ');
      box.appendChild(raw);
    }

    /* The line that turns „es laggt HART" into something with a number in it.
     * Nobody can act on an adjective. */
    const work = document.createElement('div');
    work.className = 'ln-check-work';
    work.id = 'ln-check-work';
    work.textContent = L.checkWork
      .replace('{reads}', String(d.reads))
      .replace('{wakes}', String(d.wakes))
      .replace('{nodes}', String(d.nodes));
    box.appendChild(work);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'ln-link';
    copy.textContent = L.checkCopy;
    copy.addEventListener('click', () => {
      writeClipboard(JSON.stringify(Object.assign({ version: R().version, url: location.hostname }, d), null, 1));
      toast(L.copied);
    });
    box.appendChild(copy);

    const live = document.createElement('div');
    live.className = 'ln-check-live';
    live.textContent = L.checkLive;
    box.appendChild(live);
  }

  /* On while it is on screen. Cleared when the help panel closes, the panel
   * closes, or the check is switched off again — an interval that outlives the
   * thing it is drawing is a leak, and this one would run on every tab the
   * user ever opened the panel in. */
  let checkTimer = 0;

  function stopSelfCheck() {
    state.selfCheckOn = false;
    if (checkTimer) { clearInterval(checkTimer); checkTimer = 0; }
    if (els.selfcheck) { els.selfcheck.hidden = true; els.selfcheck.innerHTML = ''; }
  }

  function runSelfCheck() {
    // A second press is "put it away", not "read it again" — it re-reads by
    // itself now, so there is nothing for a second press to do.
    if (state.selfCheckOn) { stopSelfCheck(); return; }
    state.selfCheckOn = true;
    renderSelfCheck();
    if (checkTimer) clearInterval(checkTimer);
    /* Slower than the panel's own refresh on purpose: this walks the whole
     * document looking for buttons, and it is a diagnostic, not a live
     * readout of anything time-critical. */
    checkTimer = setInterval(() => {
      if (!state.selfCheckOn || !panel || panel.hidden || (els.help && els.help.hidden)) {
        stopSelfCheck();
        return;
      }
      renderSelfCheck();
    }, 2000);
  }

  /* Which assistant for what.
   *
   * Lives inside the help panel rather than in a tab of its own: it is a thing
   * you go and look up once, not a thing you need in front of you while you
   * write. A fifth tab for it would cost every user attention every session to
   * serve a question most of them ask once.
   *
   * Built with DOM calls, links included. The three URLs are the vendors' own
   * front doors, and they are the only outbound links anywhere in Lantern. */
  function toggleCompare() {
    const on = els.compare.hidden;
    els.compare.hidden = !on;
    els.helpList.hidden = on;
    els.tennis.parentNode.hidden = on;
    els.compareOpen.textContent = on ? t().compareClose : t().compareOpen;
    if (on) renderCompare();
    /* Scroll the help panel to the top rather than to the comparison itself.
     * Bringing the block into view pushed the way back out of the frame, and a
     * view you cannot see the exit from is a trap. */
    els.help.scrollTop = 0;
  }

  function renderCompare() {
    const C = R().compare || {};
    const lang = state.lang;
    const box = els.compare;
    box.innerHTML = '';

    const p = (cls, txt) => {
      const el = document.createElement('p');
      el.className = cls;
      el.textContent = txt;
      return el;
    };

    box.appendChild(p('ln-cmp-note', (C.note && C.note[lang]) || ''));

    /* The part somebody can act on goes first, because "which one should I
     * open for this" is the actual question. The per-assistant detail below is
     * for the person who wants to know why. */
    const list = document.createElement('div');
    list.className = 'ln-cmp-choose';
    (C.choose || []).forEach(row => {
      const item = document.createElement('div');
      item.className = 'ln-cmp-row';
      item.appendChild(p('ln-cmp-when', (row.when && row.when[lang]) || ''));
      const v = (C.vendors || []).filter(x => x.id === row.pick)[0];
      const pick = document.createElement('div');
      pick.className = 'ln-cmp-pick';
      if (v) pick.appendChild(vendorLink(v));
      const why = document.createElement('span');
      why.className = 'ln-cmp-why';
      why.textContent = (row.why && row.why[lang]) || '';
      pick.appendChild(why);
      item.appendChild(pick);
      list.appendChild(item);
    });
    box.appendChild(list);

    (C.vendors || []).forEach(v => {
      const card = document.createElement('div');
      card.className = 'ln-cmp-card';
      card.dataset.vendor = v.id;

      const head = document.createElement('div');
      head.className = 'ln-cmp-head';
      head.appendChild(vendorLink(v));
      const by = document.createElement('span');
      by.className = 'ln-cmp-by';
      by.textContent = v.by;
      head.appendChild(by);
      card.appendChild(head);

      const good = p('ln-cmp-good', (v.best && v.best[lang]) || '');
      const bad = p('ln-cmp-bad', (v.weak && v.weak[lang]) || '');
      card.appendChild(good);
      card.appendChild(bad);
      box.appendChild(card);
    });

    box.appendChild(p('ln-cmp-foot', (C.footer && C.footer[lang]) || ''));
  }

  function safeExternalUrl(raw) {
    if (typeof raw !== 'string' || !raw) return '';
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch (e) { return ''; }
  }

  function trustedVendorUrl(v) {
    const id = v && v.id;
    const bundled = window.LN_RULES && window.LN_RULES.compare && window.LN_RULES.compare.vendors;
    const vendor = Array.isArray(bundled) && bundled.find(item => item && item.id === id);
    return safeExternalUrl(vendor && vendor.url);
  }

  function vendorLink(v) {
    const a = document.createElement('a');
    a.className = 'ln-cmp-name';
    const href = trustedVendorUrl(v);
    if (href) {
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    a.textContent = (v && v.name) || '';
    return a;
  }

  /* Which cards the reader has opened.
   *
   * Keyed by the card's id, not by its position, because the whole point is
   * that it survives a re-render — and a re-render is exactly when positions
   * move. Reported as: "it's annoying anything folded out closes upon changing
   * normal and tennis or german or english". It is: you open the one card you
   * wanted, switch to the tennis version of *that card*, and land back at a
   * list of twelve closed ones with no idea which was which. The switch is
   * supposed to answer the same question a second way, so the answer has to
   * still be on screen when you throw it. */
  function helpOpenSet() {
    if (!state.helpOpen) state.helpOpen = {};
    return state.helpOpen;
  }

  function renderHelp() {
    const L = t();
    /* Tennis mode swaps the source array, card for card, by id — and falls
     * back to the plain card wherever the tennis array is missing one, so an
     * incomplete set degrades to the ordinary explainer rather than to a gap. */
    /* Array.isArray, not `|| []`. These two can be replaced wholesale by the
     * hosted rules channel, which means they can arrive as an object, a string
     * or a number from a URL — and `{}.forEach` throws, which would take the
     * whole panel down rather than degrading to the bundled text. The same
     * reasoning as everywhere else data crosses that boundary. */
    const plain = explainerCards('explainer');
    const tennisSrc = explainerCards('explainerTennis');
    const byId = {};
    tennisSrc.forEach(c => { if (c && c.id) byId[c.id] = c; });
    const source = state.tennis ? plain.map(c => byId[c.id] || c) : plain;
    // A card that is not an object at all cannot be rendered; drop it quietly.

    const cards = source.filter(c =>
      c && typeof c === 'object' &&
      c.enabled !== false &&
      (!c.only || (Array.isArray(c.only) && state.provider &&
                   c.only.indexOf(state.provider.id) !== -1)));
    if (els.tennis) els.tennis.checked = !!state.tennis;
    const opened = helpOpenSet();
    // Kept across the rebuild too, so the card you were reading does not jump
    // out from under you when the list above it changes height.
    const scrollBack = els.help ? els.help.scrollTop : 0;
    els.helpList.innerHTML = '';

    cards.forEach((c, i) => {
      const item = document.createElement('div');
      item.className = 'ln-help-item';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ln-help-q';
      btn.id = 'ln-help-q' + i;
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', 'ln-help-a' + i);
      const mark = document.createElement('span');
      mark.className = 'ln-help-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = '+';
      const qt = document.createElement('span');
      qt.textContent = (c.q && c.q[state.lang]) || '';
      btn.appendChild(mark);
      btn.appendChild(qt);

      const key = c.id || ('i' + i);
      const wasOpen = !!opened[key];

      const ans = document.createElement('div');
      ans.className = 'ln-help-a';
      ans.id = 'ln-help-a' + i;
      ans.setAttribute('role', 'region');
      ans.setAttribute('aria-labelledby', btn.id);
      ans.hidden = !wasOpen;
      if (wasOpen) {
        btn.setAttribute('aria-expanded', 'true');
        mark.textContent = '\u2212';
        item.dataset.open = '1';
      }

      String((c.a && c.a[state.lang]) || '').split('\n\n').forEach(par => {
        const p = document.createElement('p');
        p.textContent = par;
        ans.appendChild(p);
      });

      /* The line that does the actual teaching. Marked up separately so it
       * reads as a takeaway rather than more prose. */
      const selfText = c.self && c.self[state.lang];
      if (selfText) {
        const sf = document.createElement('div');
        sf.className = 'ln-help-self';
        sf.textContent = selfText;
        ans.appendChild(sf);
      }

      /* A second level, folded away.
       *
       * From the first real reader: "it's all hard to understand if you don't
       * already know what's going on… remember it's for people who don't know
       * how to write { or what Fn11 does." The fix is not to make the first
       * answer longer — that just moves the wall. It is to let someone who
       * wants the mechanism ask for it, one step at a time, and to answer that
       * question with how the thing actually works rather than with more
       * instructions. */
      /* The folded levels, however many deep the card goes.
       *
       * This was one level, and one level is not enough for the question the
       * readers this is written for actually ask. "Why does it change the
       * answer if I say you are a lawyer" opens onto "so it does not know
       * anything?", which opens onto "then how can it be right about
       * anything?" — three real questions, each only asked once the one before
       * it has been answered. Rendering them as three separate cards would put
       * all three in front of somebody who has not asked any of them yet,
       * which is how an explainer becomes a wall.
       *
       * Recursive, keyed by the whole path (so a reader who is three deep and
       * flips DE/EN or tennis stays three deep), and capped at three levels
       * because past that the indentation eats the panel. */
      const MAX_DEPTH = 3;
      const renderMore = (list, host, keyPath, idPath, depth) => {
        (Array.isArray(list) ? list : []).forEach((m, j) => {
          if (!m || typeof m !== 'object') return;
          const mKey = keyPath + '#' + (m.id || j);
          const mId = idPath + '-' + j;
          const mWasOpen = !!opened[mKey];

          const mb = document.createElement('button');
          mb.type = 'button';
          mb.className = 'ln-help-more';
          mb.dataset.depth = String(depth);
          mb.id = 'ln-help-mq' + mId;
          mb.setAttribute('aria-expanded', mWasOpen ? 'true' : 'false');
          mb.setAttribute('aria-controls', 'ln-help-ma' + mId);
          const mk = document.createElement('span');
          mk.className = 'ln-help-mark';
          mk.setAttribute('aria-hidden', 'true');
          mk.textContent = mWasOpen ? '\u2212' : '+';
          const mt = document.createElement('span');
          mt.textContent = (m.q && m.q[state.lang]) || '';
          mb.appendChild(mk); mb.appendChild(mt);

          const ma = document.createElement('div');
          ma.className = 'ln-help-ma';
          ma.dataset.depth = String(depth);
          ma.id = 'ln-help-ma' + mId;
          ma.setAttribute('role', 'region');
          ma.setAttribute('aria-labelledby', mb.id);
          ma.hidden = !mWasOpen;
          // Paragraph breaks are meaningful in these — they are the pauses.
          String((m.a && m.a[state.lang]) || '').split('\n\n').forEach(par => {
            const pp = document.createElement('p');
            pp.textContent = par;
            ma.appendChild(pp);
          });

          if (depth < MAX_DEPTH) renderMore(m.more, ma, mKey, mId, depth + 1);

          mb.addEventListener('click', () => {
            const openNow = ma.hidden;
            ma.hidden = !openNow;
            mb.setAttribute('aria-expanded', String(openNow));
            mk.textContent = openNow ? '\u2212' : '+';
            if (openNow) opened[mKey] = true; else delete opened[mKey];
          });

          host.appendChild(mb);
          host.appendChild(ma);
        });
      };
      renderMore(c.more, ans, key, String(i), 1);

      btn.addEventListener('click', () => {
        const open = ans.hidden;
        ans.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
        mark.textContent = open ? '\u2212' : '+';
        item.dataset.open = open ? '1' : '';
        if (open) opened[key] = true; else delete opened[key];
      });

      item.appendChild(btn);
      item.appendChild(ans);
      els.helpList.appendChild(item);
    });

    if (els.help && scrollBack) els.help.scrollTop = scrollBack;
  }

  /* The explainer text, fetched the first time somebody opens the help panel.
   *
   * It is 143 KB of prose — thirteen cards in two languages, each with a second
   * telling in tennis terms, plus the folded questions underneath them. It used
   * to sit inside rules.js, which means every visit to chatgpt.com, claude.ai
   * and gemini.google.com parsed all of it before the page had finished
   * loading, whether or not the panel was ever opened. Almost nobody opens it,
   * and the people who do are not in a hurry at that moment.
   *
   * Moving it behind a fetch takes the always-parsed payload from 704 KB to
   * 561 KB, a fifth of it, on three of the heaviest pages on the web. A tester
   * reported "es laggt HART"; this is one of the few parts of that Lantern
   * actually controls.
   *
   * JSON rather than a script: a content script must not eval a fetched file,
   * and JSON.parse cannot execute anything. Fetched once, cached in memory,
   * and a failure degrades to the panel without cards rather than to a broken
   * panel — the same rule the hosted rules channel follows. */
  let explainerText = null;
  let explainerPending = null;

  function loadExplainer() {
    if (explainerText) return Promise.resolve(explainerText);
    if (explainerPending) return explainerPending;
    const pending = new Promise((resolve) => {
      let url = '';
      try { url = chrome.runtime.getURL('src/explainer.json'); } catch (e) { url = ''; }
      if (!url) { resolve(null); return; }
      fetch(url)
        .then(r => (r && r.ok) ? r.json() : null)
        .then(d => {
          explainerText = (d && typeof d === 'object' && Array.isArray(d.explainer)) ? d : null;
          resolve(explainerText);
        })
        .catch(() => resolve(null));
    });
    explainerPending = pending;
    return pending.then(value => {
      if (!value && explainerPending === pending) explainerPending = null;
      return value;
    });
  }

  /* The bundled cards, whatever the hosted rules channel has to say about them.
   * An override still wins, exactly as it did when these lived in rules.js. */
  function explainerCards(key) {
    const hosted = window.LN_RULES_OVERRIDE && window.LN_RULES_OVERRIDE[key];
    if (validExplainerCards(hosted)) return hosted;
    const over = R()[key];
    if (validExplainerCards(over)) return over;
    const bundled = explainerText && explainerText[key];
    return Array.isArray(bundled) ? bundled : [];
  }

  function validExplainerCards(cards, depth) {
    const level = depth || 0;
    if (!Array.isArray(cards) || !cards.length || cards.length > (level ? 24 : 64) || level > 3) return false;
    const text = (value) => typeof value === 'string' && value.length > 0 && value.length <= 16000;
    const localized = (value) => value && typeof value === 'object' && !Array.isArray(value) &&
      text(value.de) && text(value.en);
    return cards.every(card => {
      if (!card || typeof card !== 'object' || Array.isArray(card) ||
          typeof card.id !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(card.id) ||
          !localized(card.q) || !localized(card.a)) return false;
      if (card.self !== undefined && !localized(card.self)) return false;
      if (card.enabled !== undefined && typeof card.enabled !== 'boolean') return false;
      if (card.only !== undefined && (!Array.isArray(card.only) || !card.only.every(id =>
        typeof id === 'string' && /^[a-z0-9_-]{1,32}$/i.test(id)))) return false;
      return card.more === undefined || validExplainerCards(card.more, level + 1);
    });
  }

  function openHelp() {
    els.help.hidden = false;
    panel.dataset.help = '1';
    renderHelp();
    /* Already loaded: nothing flashes. First time: the panel is open and the
     * cards arrive a moment later, which is the right way round — opening has
     * to feel immediate. */
    if (!explainerText) {
      loadExplainer().then(() => {
        if (!els.help.hidden) {
          renderHelp();
          const later = els.helpList.querySelector('.ln-help-q');
          if (later) later.focus();
        }
      });
    }
    const first = els.helpList.querySelector('.ln-help-q');
    if (first) first.focus();
  }

  function closeHelp() {
    els.help.hidden = true;
    panel.dataset.help = '';
    stopSelfCheck();
    /* Leave the comparison closed behind you. Reopening the help panel into a
     * view somebody left open three days ago is the sort of state that makes a
     * tool feel like it is remembering the wrong things. */
    if (els.compare && !els.compare.hidden) {
      els.compare.hidden = true;
      els.helpList.hidden = false;
      els.tennis.parentNode.hidden = false;
      els.compareOpen.textContent = t().compareOpen;
    }
    const b = panel.querySelector('.ln-help-btn');
    if (b) b.focus();
  }

  function renderChecklist(s) {
    if (!s.text) { els.check.hidden = true; return; }
    const items = E.checklist(s);
    const missing = items.filter(i => !i.ok);
    const L = t();
    els.check.innerHTML = '';

    if (!missing.length) {
      els.check.className = 'ln-check ln-check-done';
      els.check.textContent = '✓ ' + L.checkAllDone;
      els.check.hidden = false;
      return;
    }
    els.check.className = 'ln-check';
    const lead = document.createElement('span');
    lead.className = 'ln-check-lead';
    lead.textContent = L.checkOpen + ': ';
    els.check.appendChild(lead);
    missing.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ln-check-item';
      b.dataset.field = it.key;
      b.textContent = L['check' + it.key.charAt(0).toUpperCase() + it.key.slice(1)];
      els.check.appendChild(b);
      if (i < missing.length - 1) els.check.appendChild(document.createTextNode(' · '));
    });
    els.check.hidden = false;
  }

  function renderDetailCount() {
    const done = FIELDS.filter(k => els[k].value.trim()).length;
    const fn = t().detailsCount;
    els.detCount.textContent = typeof fn === 'function' ? ' · ' + fn(done, FIELDS.length) : '';
  }

  function renderRouting() {
    const r = state.routing;
    els.btnLocal.classList.toggle('ln-btn-primary', !r || r.recommend === 'local');
    els.btnModel.classList.toggle('ln-btn-primary', !!r && r.recommend === 'model');
    const use = state.usefulness;
    if (use && use.helps !== 'build') {
      const L = t();
      const key = {
        clearRequest: 'useClearRequest',
        questionNotTask: 'useQuestionNotTask',
        ownPrompt: 'useOwnPrompt',
        externalAction: 'useExternalAction',
        sourceMissing: 'useSourceMissing',
        codeMissing: 'useCodeMissing',
        outputContract: 'useOutputContract',
        reordered: 'useReordered'
      }[use.why];
      els.route.textContent = L[key] || L.useClearRequest;
      els.route.dataset.rec = use.helps === 'material' ? 'limit' :
        (use.helps === 'reorder' ? 'reorder' : 'leave');
      els.route.hidden = false;
      return;
    }
    if (!r) { els.route.hidden = true; return; }
    const why = r.topReasons.length ? ' · ' + r.topReasons.join(', ') : '';
    els.route.textContent = t().recommend + ': ' + sub(r.verdict) + sub(why);
    els.route.dataset.rec = r.recommend;
    els.route.hidden = false;
  }

  /* With the panel closed and the in-page layer off, nothing tells the user
   * that ChatGPT asked them something or that memory looks to be interfering.
   * The launcher does. */
  function updateBadge() {
    const b = fab && fab.querySelector('.ln-fab-badge');
    if (!b) return;
    const a = state.answer;
    const questions = (a && a.askedQuestions)
      ? (a.numberedQuestions.length || a.questions.length) : 0;
    if (questions) { b.textContent = String(questions); b.dataset.kind = 'ask'; b.hidden = false; }
    else if (a && a.memorySuspect) { b.textContent = '!'; b.dataset.kind = 'warn'; b.hidden = false; }
    else { b.hidden = true; }

    // The same signal, applied to the tabs: point at the one with something in it.
    const follow = panel && panel.querySelector('#ln-tab-follow .ln-dot');
    if (follow) follow.hidden = !(questions || (a && a.memorySuspect));
    const move = panel && panel.querySelector('#ln-tab-move .ln-dot');
    const later = panel && panel.querySelector('#ln-tab-later .ln-dot');
    if (later) later.hidden = !state.queue.length;
    if (move) move.hidden = !(messageCount() >= 14 || state.mvWaiting || state.handover);
  }

  function updateGrabLink() {
    if (!els.grab) return;
    els.grab.hidden = !(state.answer && state.answer.present && lastAnswerCode());
  }

  /* ----------------------------------------------------- follow-up tab */

  function renderFeedbackContext() {
    if (els.repeatContext) els.repeatContext.hidden = !state.sentPrompt;
  }

  function renderFollowUps() {
    const L = t();
    const list = followUpsList();
    const a = state.answer;
    renderFeedbackContext();

    /* When ChatGPT is waiting on answers, answering it is the only sensible
     * next move. A menu of nine other things to say is noise at that moment,
     * so it steps aside behind one link. */
    renderMemory();
    const helperOn = renderQuestionHelper();
    const hideList = helperOn && !state.showFollowAnyway;
    els.followBlock.hidden = hideList;
    els.followAnyway.hidden = !hideList;
    if (hideList) return;

    els.followIntro.textContent = (a && a.present) ? L.followIntro : L.followNoAnswer;

    const ranked = E.rankFollowUps(a, { goal: state.goal, provider: state.provider && state.provider.id });
    const matched = ranked.filter(r => r.score > 0);
    const relevant = matched.slice(0, 4);
    const rest = matched.slice(4);
    const show = state.showAllFollowUps ? matched : relevant;

    // Only claim something fits the answer when there is an answer to fit.
    els.followHead.hidden = !(relevant.length && !state.showAllFollowUps && a && a.present);
    els.followHead.textContent = L.followFits;
    renderDrift();

    els.followList.innerHTML = '';
    show.forEach(r => {
      const f = list[r.index];
      if (!f) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ln-follow';
      b.dataset.follow = String(r.index);
      b.title = f.text[state.lang];

      const label = document.createElement('span');
      label.className = 'ln-follow-label';
      label.textContent = sub(f.label[state.lang]);
      b.appendChild(label);

      const does = document.createElement('span');
      does.className = 'ln-follow-does';
      does.textContent = sub((f.does && f.does[state.lang]) || '');
      b.appendChild(does);

      const why = (a && a.present && r.why) && ((R().signalLabels || {})[state.lang] || {})[r.why];
      if (why && !state.showAllFollowUps) {
        const w = document.createElement('span');
        w.className = 'ln-follow-why';
        w.textContent = L.followBecause + ' ' + why;
        b.appendChild(w);
      }
      els.followList.appendChild(b);
    });

    els.followMore.hidden = !rest.length;
    els.followMore.textContent = state.showAllFollowUps ? L.followLess : L.followAll;
  }

  /* Lantern deliberately makes ChatGPT ask clarifying questions. Leaving the
   * user to answer four numbered questions unaided is abandoning them at the
   * exact moment the technique was supposed to help. */
  function renderQuestionHelper() {
    const a = state.answer;
    const qs = (a && a.askedQuestions)
      ? (a.numberedQuestions.length ? a.numberedQuestions : a.questions).slice(0, 6)
      : [];
    if (!qs.length) { els.questions.hidden = true; return false; }

    const signature = qs.join('|');
    if (els.qList.dataset.sig !== signature) {
      els.qList.dataset.sig = signature;
      els.qList.innerHTML = '';
      qs.forEach((q, i) => {
        const row = document.createElement('div');
        row.className = 'ln-q';
        const label = document.createElement('div');
        label.className = 'ln-q-text';
        label.textContent = (i + 1) + '. ' + q;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ln-q-input';
        input.placeholder = t().qPlaceholder;
        row.appendChild(label);
        row.appendChild(input);
        els.qList.appendChild(row);
      });
    }
    els.questions.hidden = false;
    return true;
  }

  function insertAnswers() {
    const L = t();
    const rows = Array.from(els.qList.querySelectorAll('.ln-q'));
    if (!rows.length) return;
    const lines = rows.map((row, i) => {
      const v = row.querySelector('.ln-q-input').value.trim();
      return (i + 1) + '. ' + (v || L.qUnknown);
    });
    const msg = L.qLead + '\n' + lines.join('\n') + '\n\n' + L.qTail;
    if (insertIntoComposer(msg)) { toast(L.followInserted); setTimeout(close, 500); }
    else { writeClipboard(msg); toast(L.clipboardFallback); }
  }

  /* ------------------------------------------------------------- handover */

  function userTurns() {
    return nodes('user', '[data-message-author-role="user"]').length;
  }

  function renderMemory() {
    const a = state.answer;
    const on = !!(a && a.memorySuspect);
    els.mem.hidden = !on;
    if (!on) return;
    els.memQuotes.innerHTML = '';
    a.memoryEcho.slice(0, 4).forEach(q => {
      const chip = document.createElement('span');
      chip.className = 'ln-mem-quote';
      chip.textContent = '„' + q + '…“';
      els.memQuotes.appendChild(chip);
    });
  }

  function messageCount() {
    return nodes('message', '[data-message-author-role]').length;
  }

  function renderMove() {
    const L = t();
    const n = messageCount();
    els.mvSize.textContent = !n ? L.mvSizeNone
      : (n >= 14 ? L.mvSizeLong(n) : L.mvSizeShort(n));
    els.mvSize.dataset.long = String(n >= 14);
    renderDrift();
    els.mvResult.hidden = !state.handover;
    if (state.handover && els.mvOut.value !== state.handover) els.mvOut.value = state.handover;
    els.mvWait.hidden = !state.mvWaiting || !!state.handover;
  }

  function doHandoverRequest() {
    const req = E.buildHandoverRequest({ lang: state.lang, parts: state.mvParts });
    const before = lastAnswerText();
    if (insertIntoComposer(req)) {
      // The sharpen flow collects its own result; making the user come back and
      // press a second button here was the odd one out.
      state.mvWaiting = Date.now();
      state.mvBefore = before;
      renderMove();
      toast(t().followInserted);
      setTimeout(close, 500);
    } else { writeClipboard(req); toast(t().clipboardFallback); }
  }

  /* Watches for the handover to appear after step 1. Gives up after ten
   * minutes so a forgotten request cannot hijack an unrelated code block. */
  function tryHandoverCollect() {
    if (!state.mvWaiting || state.capturing) return;
    if (Date.now() - state.mvWaiting > 10 * 60 * 1000) {
      state.mvWaiting = 0;
      state.mvBefore = '';
      renderMove();
      return;
    }
    if (lastAnswerText() === state.mvBefore) return;
    const code = lastAnswerCode();
    if (!code || code.length < 60) return;
    state.mvWaiting = 0;
    state.mvBefore = '';
    state.handover = code;
    els.mvOut.value = code;
    saveHandover();
    renderMove();
    if (panel.hidden) open();
    setTab('move');
    toast(t().mvGot);
  }

  function doHandoverCollect() {
    const code = lastAnswerCode();
    if (!code || code.length < 40) { toast(t().mvStep2None); return; }
    state.mvWaiting = 0;
    state.mvBefore = '';
    state.handover = code;
    els.mvOut.value = code;
    renderMove();
    saveHandover();
    els.mvResult.scrollIntoView({ behavior: motion(), block: 'nearest' });
  }

  function doHandoverLaunch() {
    const handover = els.mvOut.value.trim();
    if (!handover) return;
    state.handover = handover;
    saveHandover();
    const msg = E.buildHandoverLaunch(handover, { lang: state.lang, next: els.mvNext.value });
    // A continuation belongs in a real chat, not a temporary one.
    openChat(msg, false, 'open', true);
  }

  function saveHandover() {
    STORE.set({ lnHandover: { text: state.handover, ts: Date.now() } });
  }

  /* ---------------------------------------------------------- page layer */

  /* What the in-page layer needs to know. Rebuilt on every refresh so the bar
   * under the last answer always describes the answer that is actually there. */
  function pageCtx() {
    const list = followUpsList();
    const shortLabels = (R().signalShort || {})[state.lang] || {};
    const whyLabels = (R().signalLabels || {})[state.lang] || {};
    const a = state.answer;
    const ranked = E.rankFollowUps(a, { goal: state.goal, provider: state.provider && state.provider.id });
    const top = (a && a.present) ? ranked.filter(r => r.score > 0).slice(0, 3) : [];
    return {
      i18n: t(),
      /* Measured, not assumed, and abandoned when it would do harm.
       *
       * This was a hardcoded 436px. On a narrow window that is wider than the
       * space there is, so padding the body by it pushed the conversation off
       * the side and gave the whole page a horizontal scrollbar — Lantern
       * making the page worse, which is the one thing the in-page layer must
       * never do. Now it is the panel's real width, and if that leaves no
       * readable column the push is skipped and the panel simply overlaps,
       * which is the documented fallback. */
      /* How much room to make on the right — and whether to make any at all.
       *
       * This used to be the panel's width, full stop, wherever the panel was.
       * Reported by a tester: "dies sollte aber nur der fall sein wenn das
       * window gerade rechts ist. sobald es etwas weiter links ist wäre es gut
       * wenn claude so groß wie normalerweise ist." Exactly right — right-hand
       * padding only helps while the thing being made room for is against the
       * right edge. Drag the panel into the middle and the padding becomes an
       * empty strip on one side of a page that is still covered on the other.
       *
       * So: room is made only while the panel occupies the right edge, and the
       * amount is its footprint from that edge rather than its width, which are
       * the same number at the default position and diverge as soon as anybody
       * nudges it. Anywhere else the panel is a floating window that overlaps,
       * which was always the documented fallback. */
      inset: (() => {
        if (!panel || panel.hidden) return 0;
        const r = panel.getBoundingClientRect();
        if (!r.width) return 0;
        /* clientWidth, not innerWidth: innerWidth counts the scrollbar and
         * getBoundingClientRect does not, so on any page long enough to
         * scroll the two disagree by about fifteen pixels — enough, with a
         * 16px resting gap, to read the panel as "moved away from the edge"
         * and refuse to make room. That is exactly the bug this test caught
         * on the real extension while the stubbed page passed. */
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const AT_EDGE = 40;
        if ((vw - r.right) > AT_EDGE) return 0;
        const need = Math.ceil(vw - r.left);
        /* Never make the page worse: if what is left is not a readable column,
         * overlap instead. */
        return (vw - need) >= 360 ? need : 0;
      })(),
      makeRoom: true,
      /* Which of the site's own controls to ring, if any. One at a time: the
       * one the user last touched in the capability row, and only when that
       * capability is actually a button on this assistant. */
      point: (() => {
        const C = R().capabilities;
        const P = state.provider;
        const id = state.capNote;
        if (!C || !P || !id) return null;
        const w = ((C.where || {})[P.id] || {})[id];
        if (!w || (w.how !== 'button' && w.how !== 'setting')) return null;
        const words = (P.capWords && P.capWords[id]) || [];
        if (!words.length) return null;
        return { words: words, label: t().capPoint };
      })(),
      answer: a,
      composer: composer,
      lastAnswerEl: lastAssistantEl,
      reads: ((a && a.signals) || []).map(x => shortLabels[x]).filter(Boolean),
      warn: !!(a && a.memorySuspect) && shortLabels.memory,
      questionCount: (a && a.askedQuestions)
        ? (a.numberedQuestions.length || a.questions.length) : 0,
      hasCode: !!lastAnswerCode(),
      followUps: top.map(r => ({
        index: r.index,
        label: sub(list[r.index] && list[r.index].label[state.lang]),
        why: whyLabels[r.why] || ''
      })).filter(f => f.label),
      onFollow: (i) => insertFollowUp(i),
      onQuestions: () => { if (panel.hidden) open(); setTab('follow'); },
      onGrab: () => { if (panel.hidden) open(); doGrab(); }
    };
  }

  function enablePage() {
    if (!state.pageLayer || !window.LN_INPAGE) return;
    try { window.LN_INPAGE.enable(pageCtx()); syncPageLook(); } catch (e) {}
  }
  function refreshPage() {
    if (!window.LN_INPAGE || !window.LN_INPAGE.isOn()) return;
    try { syncPageLook(); window.LN_INPAGE.refresh(pageCtx()); } catch (e) {}
  }
  function disablePage() {
    try { if (window.LN_INPAGE) window.LN_INPAGE.disable(); } catch (e) {}
    clearPageLook();
  }

  function applyLang() {
    const L = t();
    root.setAttribute('lang', state.lang);
    root.querySelectorAll('[data-t]').forEach(el => {
      const v = L[el.dataset.t];
      if (typeof v === 'string') el.textContent = v;
    });
    /* Controls whose visible content is an icon or two letters. Sighted users
     * read "DE" from its position next to "EN"; a screen reader reads it as
     * two letters with no context, so the name is supplied. */
    root.querySelectorAll('[data-t-label]').forEach(el => {
      const v = L[el.dataset.tLabel];
      if (typeof v === 'string') el.setAttribute('aria-label', v);
    });
    panel.querySelectorAll('.ln-lang button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang));
    });
    fab.querySelector('.ln-fab-label').textContent = L.brand;
    fab.title = L.open + '  (Ctrl+Shift+K)';
    panel.querySelector('.ln-x').title = L.close;

    els.text.placeholder = L.inputPlaceholder;
    els.aud.placeholder = L.audiencePh;
    els.fmt.placeholder = L.formatPh;
    els.inc.placeholder = L.includePh;
    els.avo.placeholder = L.avoidPh;
    els.ctx.placeholder = L.contextPh;
    els.ex.placeholder = L.examplePh;

    const keepKind = els.kind.value;
    els.kind.innerHTML = '';
    R().archetypes.forEach(a => {
      const o = document.createElement('option');
      o.value = a.id;
      o.textContent = sub(a.label[state.lang]);
      els.kind.appendChild(o);
    });
    els.kind.value = keepKind || E.detectArchetype(els.text.value);

    els.goals.innerHTML = '';
    R().goals.forEach(g => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ln-goal';
      b.dataset.goal = g.id;
      b.setAttribute('role', 'radio');
      b.textContent = g.short[state.lang];
      b.title = sub(g.label[state.lang] + ' — ' + g.hint[state.lang]);
      els.goals.appendChild(b);
    });
    paintGoals();
    renderCaps();

    els.mvParts.innerHTML = '';
    ((R().handover && R().handover.parts) || []).filter(p => !p.always).forEach(p => {
      const lab = document.createElement('label');
      lab.className = 'ln-chk';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.dataset.part = p.id;
      box.checked = state.mvParts.indexOf(p.id) !== -1;
      box.addEventListener('change', () => {
        state.mvParts = state.mvParts.filter(x => x !== p.id);
        if (box.checked) state.mvParts.push(p.id);
      });
      const span = document.createElement('span');
      span.textContent = (p.label && p.label[state.lang]) || p.id;
      lab.appendChild(box);
      lab.appendChild(span);
      els.mvParts.appendChild(lab);
    });

    /* The manual override has to offer *this* provider's models. It was built
     * from rules.js, so a Claude user opening Details was offered ChatGPT's
     * line-up to choose from — which is not a small cosmetic slip: picking one
     * would have set the wrong tier and reshaped the prompt. */
    const keepModel = els.model.value;
    els.model.innerHTML = '';
    const tierSrc = (state.provider && state.provider.tiers) || R().modelTiers || [];
    [['auto', L.modelAuto]].concat(tierSrc.reduce((acc, tr) =>
      acc.concat((tr.names || []).filter(n => n !== 'mini' && n !== 'thinking' && n !== 'auto')
        .map(n => [n, state.provider && state.provider.id === 'chatgpt'
          ? cap(n) : cap(n) + ' — ' + tr.label[state.lang]])), []))
      .forEach(([v, label]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = label;
        els.model.appendChild(o);
      });
    /* state first, not the old DOM value. Rebuilding the list on a language
     * switch used to re-apply whatever was in the select, which on the pass
     * that runs during restore() is the default 'auto' — so a stored model
     * choice was overwritten by the placeholder that preceded it. */
    els.model.value = state.modelChoice || keepModel || 'auto';

    els.mvNext.placeholder = L.mvNextPh;
    renderMove();
    els.qList.dataset.sig = '';
    renderFollowUps();
    renderRouting();
    renderDetailCount();
    /* The explainer and the comparison are built from rules.js rather than
     * from `data-t` attributes, so the sweep at the top of this function does
     * not touch them. Without these two lines, switching language with the
     * help panel open left every answer in the old one — which is exactly the
     * moment somebody switches, because they could not read it. */
    if (els.help && !els.help.hidden) {
      renderHelp();
      if (els.compare && !els.compare.hidden) renderCompare();
    }
    if (els.intro && !els.intro.hidden) renderIntroTabs();
    setTab(state.tab);
    // The in-page layer carries its own copies of these strings, so it has to
    // follow the language too — otherwise the composer keeps an English label
    // on a German panel.
    refreshPage();
  }

  /* -------------------------------------------------------------- actions */

  function collect(quiet) {
    if (!quiet) redetect();
    return {
      text: els.text.value.trim(),
      lang: state.lang,
      archetype: els.kind.value || 'general',
      goal: state.goal,
      manualKind: !!state.manualKind,
      manualGoal: !!state.manualGoal,
      audience: els.aud.value,
      format: els.fmt.value,
      include: els.inc.value,
      avoid: els.avo.value,
      context: els.ctx.value,
      example: els.ex.value,
      scope: els.scope.checked,
      tier: currentTier(),
      improve: els.improve.checked,
      improveExplicit: !!state.improveExplicit,
      sources: els.sources.checked,
      ignoreMemory: els.ignoreMemory.checked,
      parts: state.parts.slice(),
      /* Set by "build it out anyway" under the verdict, and cleared the moment
       * the request itself changes: it is an override of this build, not a
       * setting. */
      caps: (state.caps || []).slice(),
      corrected: !!state.corrected,
      force: !!state.forceFull,
      /* The other two handles under the result. Same lifetime as `force`:
       * this build, not this session. */
      lean: !!state.leanPrompt,
      ask: !!state.askFirst,
      /* Which assistant, and which of its models — the prompt's shape depends
       * on both, and on Claude the two disagree with each other. */
      provider: state.provider ? state.provider.id : null,
      family: currentFamily()
    };
  }

  function fitResult() {
    try {
      els.out.style.height = 'auto';
      els.out.style.height = Math.min(460, Math.max(150, els.out.scrollHeight + 4)) + 'px';
    } catch (e) {}
  }

  /* Say out loud what just happened.
   *
   * The prompt appearing is the moment the whole tool exists for, and until
   * 0.10.0 it happened in total silence for anyone not watching the screen.
   * The obvious fix — putting aria-live on the result box — is the wrong one:
   * it would read four hundred words of generated prompt aloud, every time.
   * So a short sentence is announced instead, and the prompt itself stays a
   * labelled textarea the user can navigate to and read at their own pace. */
  function announce(msg) {
    if (!els.announce || !msg) return;
    // Re-announce an identical message by clearing first; a live region that
    // receives the same string twice says nothing the second time.
    els.announce.textContent = '';
    setTimeout(() => { try { els.announce.textContent = msg; } catch (e) {} }, 60);
  }

  /* Pasting something long turns it into a file attachment, and the first real
   * user called that a nuisance. Two things help, and neither is a workaround:
   *
   *   1. Say it before it happens, so it is not a surprise.
   *   2. Say that it is fine — the assistant reads attachments — because the
   *      anxiety is the actual cost. What people do otherwise is chop the text
   *      into pieces and send them one at a time, which makes the answer worse.
   *
   * On ChatGPT there is a way back ("Show in text field") and it is named. On
   * Claude there is not, so the note says so rather than implying one. */
  function renderPaste(text) {
    if (!els.paste) return;
    const r = E.pasteRisk(text, state.provider);
    if (!r || (!r.likely && !r.near)) { els.paste.hidden = true; return; }
    const L = t();
    const bits = [r.likely ? L.pasteLikely : L.pasteNear];
    if (r.revert) bits.push(L.pasteRevert.replace('{r}', r.revert));
    else bits.push(L.pasteNoRevert);
    els.paste.textContent = bits.join(' ');
    els.paste.hidden = false;
  }

  /* Say what the build did differently for this assistant and this model.
   *
   * "not sure if it actually correctly adjusts prompts from the different
   * claude or chatgpt models" — the adaptations were real and every one of
   * them was invisible, so the doubt had no way to resolve either way. This is
   * the answer, and it is a list of what happened rather than a claim that
   * something happened.
   *
   * Built with DOM calls: the strings come from rules-replaceable i18n, and
   * text that can arrive from a URL must never be parsed as markup. */
  function renderAdapted(built) {
    if (!els.adapted) return;
    const L = t();
    if (built && built.asIs) {
      els.adapted.textContent = '';
      els.adapted.hidden = true;
      return;
    }
    const list = (built && built.adapted) || [];
    const KEY = {
      roleYours: 'adaptRoleYours', roleDeep: 'adaptRoleDeep',
      roleProvider: 'adaptRoleProvider', materialFirst: 'adaptMaterialFirst',
      xmlTags: 'adaptXmlTags', qualityCap: 'adaptQualityCap',
      orderLine: 'adaptOrderLine', negativesLast: 'adaptNegativesLast',
      anchor: 'adaptAnchor', noReasoningAsk: 'adaptNoReasoningAsk',
      reordered: 'adaptReordered'
    };
    const words = list.map(a => {
      const v = L[KEY[a.id]];
      if (typeof v !== 'string') return null;
      return a.detail === undefined ? v : v.replace('{n}', String(a.detail));
    }).filter(Boolean);

    els.adapted.innerHTML = '';
    const lead = document.createElement('b');
    lead.textContent = L.adaptedLead.replace('{ai}', providerLabel());
    els.adapted.appendChild(lead);
    const ul = document.createElement('ul');
    if (!words.length) {
      const li = document.createElement('li');
      li.textContent = L.adaptNone;
      ul.appendChild(li);
    } else {
      words.forEach(w => { const li = document.createElement('li'); li.textContent = w; ul.appendChild(li); });
    }
    els.adapted.appendChild(ul);
    els.adapted.hidden = false;
  }

  /* What Lantern did, said in one line, including the case where it did almost
   * nothing.
   *
   * This is the half of the right-sizing change that makes it a feature rather
   * than a tool that mysteriously stopped working. A panel that hands back your
   * own sentence with no explanation looks broken; the same thing with „das
   * braucht Lantern nicht" beside it is the tool telling you the truth, which
   * is the only reason to believe it the next time it says a request does need
   * work. The way out is right there too, because a request's length is not the
   * only thing that decides whether it is worth building out, and the person
   * typing it knows things the word count does not. */
  function canOverrideUseLimit(built) {
    return !!built && ['externalAction', 'sourceMissing', 'codeMissing', 'outputContract'].indexOf(built.why) === -1;
  }

  function renderVerdict(built) {
    if (!els.verdict) return;
    const L = t();
    els.verdict.textContent = '';
    if (!built) { els.verdict.hidden = true; return; }

    const line = document.createElement('p');
    if (built.frame === 'reorder') {
      line.textContent = L.verdictReordered;
    } else if (built.frame === 'full') {
      line.textContent = state.forceFull ? L.verdictForced : L.verdictFull;
    } else if (built.asIs || built.helps === 'no' || built.helps === 'capability' || built.helps === 'material') {
      /* The verdict that had to be added after a real A/B came back against
       * us: not „you do not need me", but „this is a kind of request I make
       * worse", with the reason. */
      line.textContent = (L['verdictWhy_' + built.why] || L.verdictWhy_questionNotTask)
        .replace('{ai}', providerLabel());
    } else {
      line.textContent = built.asIs ? L.verdictAsIs
        : (built.frame === 'none' ? L.verdictNearly : L.verdictLight)
          .replace('{ai}', providerLabel());
    }
    els.verdict.appendChild(line);

    /* And what WOULD help, where there is something. A suggestion that turns
     * into one click on the chip it names, because an answer nobody can act on
     * is only half an answer. */
    (built.suggest || []).slice(0, 1).forEach(id => {
      const c = capsFor().find(x => x.id === id);
      if (!c || c.how === 'none') return;
      const p = document.createElement('p');
      p.className = 'ln-verdict-help';
      p.textContent = (c.how === 'auto' ? L.verdictInsteadAuto : L.verdictInstead)
        .replace('{cap}', c.label).replace('{ai}', providerLabel());
      els.verdict.appendChild(p);
      if ((state.caps || []).indexOf(id) === -1) {
        const b = verdictButton('usecap', L.verdictUseCap.replace('{cap}', c.label));
        b.dataset.capId = id;
        els.verdict.appendChild(b);
      }
    });

    /* The price, in the only unit that has been measured.
     *
     * Follow rates fall as instructions stack — about 96% at one, and 60/43/20
     * per cent at twenty depending on the model. So every line Lantern adds is
     * spent out of the same pot as the user's own request, and the honest thing
     * is to show the bill rather than to claim the additions are free. It also
     * gives the two buttons underneath a number to move. */
    if (built.instructions) {
      const cost = document.createElement('p');
      cost.className = 'ln-verdict-cost';
      cost.textContent = (built.instructions === 1 ? L.verdictCostOne : L.verdictCost)
        .replace('{n}', String(built.instructions));
      els.verdict.appendChild(cost);
    }

    /* Three moves, and they are the ones that make sense on a PROMPT.
     *
     * Reported by a tester: „die tools um im tool zu arbeiten machen nur
     * optionen wie 'mark whats uncertain' oder 'half as long' die bei prompts
     * halt nicht sinnvoll sind". Those belong to an answer. What you do to a
     * prompt is make it carry more, make it carry less, or stop it guessing. */
    const row = document.createElement('div');
    row.className = 'ln-verdict-row';
    if (built.why === 'sourceMissing' || built.why === 'codeMissing') {
      row.appendChild(verdictButton('addcontext', L.verdictAddContext));
    }
    if (canOverrideUseLimit(built)) {
      if (built.frame === 'full') {
        row.appendChild(verdictButton(state.forceFull ? 'shrink' : 'lean',
          state.forceFull ? L.verdictShrink : L.verdictLean));
      } else {
        row.appendChild(verdictButton('expand', L.verdictExpand));
      }
      /* Offered only where it would change something: a prompt that already
       * sends the model back to the user does not need a button that adds the
       * instruction it already has. */
      if (state.askFirst) row.appendChild(verdictButton('askfirst', L.verdictAskOff));
      else if (!built.asked) row.appendChild(verdictButton('askfirst', L.verdictAsk));
    }
    if (row.childNodes.length) els.verdict.appendChild(row);
    els.verdict.hidden = false;
  }

  /* The detail fields live behind a fold, and „build it out anyway" means both
   * things at once: use the full frame, and show me where I would put what it
   * is missing. Opening the fold is the half that answers the second one. */
  function openDetails() {
    const d = root && root.querySelector('.ln-det-main');
    if (d) d.open = true;
  }

  function verdictButton(act, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ln-link ln-verdict-more';
    b.dataset.act = act;
    b.textContent = label;
    return b;
  }

  function providerLabel() {
    return (state.provider && state.provider.label) || 'ChatGPT';
  }

  function showResult(text, note, kind, update) {
    // A result that did not come from doBuild has no adaptation list of its
    // own; showing the previous one beside it would be a lie by adjacency.
    if (els.adapted) els.adapted.hidden = true;
    if (els.verdict) els.verdict.hidden = true;
    els.out.value = text;
    fitResult();
    els.note.textContent = note;
    els.note.dataset.kind = kind || 'ok';
    if (els.resultUpdated) {
      els.resultUpdated.textContent = update || '';
      els.resultUpdated.hidden = !update;
    }
    renderPaste(text);
    els.result.hidden = false;
  }

  /* ------------------------------------------------------------- activity
   *
   * The router's threshold of 4 is a judgement call, and so is every keyword
   * list behind it. Nobody — not the user, not me — can currently tell whether
   * that call is right, because nothing records what happens. This does, in
   * the only form that is defensible: counters.
   *
   * What is kept: how many prompts were built, how many sharpened, how often
   * the recommendation was taken, which kinds of task fire, and the
   * distribution of router scores. What is never kept: a single word anyone
   * wrote. The validator in store.js enforces that shape independently, so a
   * later careless change here cannot start storing text.
   *
   * It never leaves the browser, and the popup shows the user exactly what it
   * holds — a statistic the person it is about cannot read is surveillance,
   * not measurement. */
  function bumpStats(fn) {
    try {
      chrome.storage.local.get(['lnStats'], (v) => {
        let error = null;
        try { error = chrome.runtime.lastError; } catch (e) { error = e; }
        if (error) return;
        const cur = (v && v.lnStats) || {};
        const st = {
          built: cur.built || 0, sharpened: cur.sharpened || 0,
          inserted: cur.inserted || 0, overrode: cur.overrode || 0,
          followed: cur.followed || 0, against: cur.against || 0,
          since: cur.since || Date.now(),
          kinds: Object.assign({}, cur.kinds || {}),
          scores: Object.assign({}, cur.scores || {})
        };
        try { fn(st); } catch (e) { return; }
        STORE.set({ lnStats: st });
      });
    } catch (e) {}
  }

  function recordRun(s, took) {
    const r = state.routing;
    bumpStats((st) => {
      st[took]++;
      if (s.archetype) st.kinds[s.archetype] = (st.kinds[s.archetype] || 0) + 1;
      if (r && typeof r.score === 'number') {
        // Clamped: the histogram has a fixed number of buckets, and an
        // unbounded key set is how a counter store turns into a memory leak.
        const k = 's' + Math.max(0, Math.min(12, r.score));
        st.scores[k] = (st.scores[k] || 0) + 1;
      }
      if (r && r.recommend) {
        const wanted = r.recommend === 'chatgpt' ? 'sharpened' : 'built';
        if (took === wanted) st.followed++; else st.against++;
      }
    });
  }

  function doBuild(automatic) {
    const s = collect();
    if (!s.text) { toast(t().inputEmpty); els.text.focus(); return; }
    const r = E.buildPrompt(s);
    const unchanged = r.asIs;
    const externalAction = r.why === 'externalAction';
    const sourceMissing = r.why === 'sourceMissing';
    const codeMissing = r.why === 'codeMissing';
    const outputContract = r.why === 'outputContract';
    const reordered = r.why === 'reordered';
    let note;
    if (externalAction) note = t().externalActionNote;
    else if (sourceMissing) note = t().sourceMissingNote;
    else if (codeMissing) note = t().codeMissingNote;
    else if (outputContract) note = t().outputContractNote;
    else if (reordered) note = t().reorderedNote;
    else if (unchanged) note = t().asIsNote;
    else note = r.vague ? t().vagueNote : t().detailNote;
    let update = '';
    if (automatic && t().autoUpdated) {
      const selectedGoal = (R().goals || []).find(goal => goal.id === s.goal);
      const goalLabel = selectedGoal && selectedGoal.short && selectedGoal.short[state.lang];
      update = t().autoUpdated(goalLabel || '');
    }
    const kind = (externalAction || sourceMissing || codeMissing || outputContract || (r.vague && !unchanged)) ? 'ask' : 'ok';
    if (update) showResult(r.prompt, note, kind, update);
    else showResult(r.prompt, note, kind);
    renderAdapted(r);
    renderVerdict(r);
    state.lastAdapted = r.adapted || [];
    if (!automatic) {
      let announcement;
      if (sourceMissing || codeMissing) announcement = t().a11yNeedMaterial;
      else if (outputContract) announcement = t().a11yOutputContract;
      else if (reordered) announcement = t().a11yReordered;
      else if (unchanged) announcement = t().a11yUnchanged;
      else announcement = r.vague ? t().a11yBuiltVague : t().a11yBuilt;
      announce(announcement.replace('{n}', String(r.prompt.split(/\s+/).length)));
      els.result.scrollIntoView({ behavior: motion(), block: 'nearest' });
      pushHistory(s);
      recordRun(s, 'built');
      save();
    }
  }

  /* Where a new chat lives — for the assistant this page actually is.
   *
   * This was hardcoded to chatgpt.com from the days when there was only one,
  * which meant "start in a new chat" on claude.ai opened ChatGPT and threw
  * the user out of the conversation they were in. The URL shape differs per
  * provider, so the provider builds its own. */
  function chatBase() {
    const p = state.provider;
    if (!p || p.id === 'chatgpt') {
      return location.hostname.indexOf('openai.com') !== -1
        ? 'https://chat.openai.com/' : 'https://chatgpt.com/';
    }
    return 'https://' + ((p.hosts && p.hosts[0]) || location.hostname) + '/';
  }

  /* `mark` is 'sharpen' or 'open' — see LN_MARK at the top of the file. */
  function openChat(prompt, temporary, mark, autoInsert) {
    const p = state.provider;
    const base = chatBase();
    const build = (text) => {
      try { return (p && p.newChat) ? p.newChat(base, text, temporary) : base; }
      catch (e) { return base; }
    };

    // Message text never goes in a provider URL. The carried copy below is
    // shown in Lantern, where a person explicitly inserts it into the composer.
    let url = build('');

    url += (mark === 'sharpen' ? '#ln=sharpen' : '#ln=open');

    /* The new tab picks this up and opens with the text ready in Lantern.
     *
     * Provider URL prefill is intentionally avoided: an undocumented URL
     * parameter must never be able to send a message without a user action.
     * The five-minute window is long enough for a slow page load and short
     * enough that a tab opened tomorrow is not "the run that opened it". */
    let win = null;
    try {
      // Opening a blank tab preserves the click's user activation. It is only
      // navigated after storage confirms the carry is available to its script.
      win = window.open('', '_blank');
    } catch (e) { win = null; }
    try { if (win) win.opener = null; } catch (e) {}

    let launched = false;
    const launch = () => {
      if (launched) return;
      launched = true;
      if (win && !win.closed) {
        try { win.location.replace(url); return; } catch (e) {}
      }
      try { chrome.runtime.sendMessage({ type: 'LN_OPEN_TAB', url: url }); } catch (e) {}
    };

    const carry = { text: prompt, ts: Date.now(), lang: state.lang };
    if (autoInsert === true) carry.autoInsert = true;
    const handoff = { lnCarry: carry };
    // The sharpen tab needs both records on its very first load. Writing them
    // separately let a quick tab restore lnCarry before lnSharpen existed.
    if (mark === 'sharpen') handoff.lnSharpen = { ts: Date.now(), lang: state.lang };
    try { STORE.set(handoff, launch); }
    catch (e) { launch(); }
  }

  function autoInsertCarry() {
    const text = state.carry;
    if (!text) return;
    let attempts = 0;

    const clearCarry = () => {
      state.carry = '';
      state.carryAutoInsert = false;
      STORE.remove('lnCarry');
    };
    const showFallback = () => {
      if (state.carry !== text) return;
      clearCarry();
      open();
      els.intro.hidden = true;
      showResult(text, t().carryReady, 'ok');
      els.result.scrollIntoView({ block: 'start' });
    };
    const attempt = () => {
      if (state.carry !== text) return;
      if (insertIntoComposer(text)) {
        clearCarry();
        toast(t().handoverInserted);
        return;
      }
      attempts++;
      if (attempts >= 20) { showFallback(); return; }
      setTimeout(attempt, 150);
    };

    attempt();
  }

  function doRefine() {
    const s = collect();
    if (!s.text) { toast(t().inputEmpty); els.text.focus(); return; }
    const meta = E.buildMetaPrompt(s);
    const before = lastAnswerText();
    if (insertIntoComposer(meta)) {
      state.capturing = true;
      state.sharpenBefore = before;
      state.sharpenStarted = Date.now();
      state.sharpenSource = s.text;
      toast(t().refineReady);
      setTimeout(close, 300);
    } else {
      state.sharpenSource = '';
      writeClipboard(meta);
      toast(t().clipboardFallback);
    }
    pushHistory(s);
    recordRun(s, 'sharpened');
    save();
  }

  /* Lift the sharpened prompt out of ChatGPT's reply so the user copies it from
   * Lantern rather than hunting for it in a code block. */
  function tryCapture() {
    if (!state.capturing) return false;
    if (state.sharpenStarted && Date.now() - state.sharpenStarted > 10 * 60 * 1000) {
      state.capturing = false;
      state.sharpenBefore = '';
      state.sharpenStarted = 0;
      state.sharpenSource = '';
      return false;
    }
    if (lastAnswerText() === state.sharpenBefore) return false;
    const code = lastAnswerCode();
    if (!code || code.length < 40) return false;
    const source = state.sharpenSource || '';
    state.capturing = false;
    state.sharpenBefore = '';
    state.sharpenStarted = 0;
    state.sharpenSource = '';
    STORE.remove('lnSharpen');
    if (source && !sharpenedPreservesSource(code, source)) {
      showResult(source, t().sharpenLossy, 'ask');
      if (panel.hidden) open();
      setTab('prompt');
      els.intro.hidden = true;
      els.result.scrollIntoView({ block: 'start' });
      toast(t().sharpenLossy);
      return true;
    }
    showResult(code, t().sharpenGot, 'ok');
    if (panel.hidden) open();
    setTab('prompt');
    // The prompt is the only thing this tab was opened for; do not make the
    // user scroll past the intro and an empty input box to reach it.
    els.intro.hidden = true;
    els.result.scrollIntoView({ block: 'start' });
    toast(t().sharpenGot);
    return true;
  }

  function doGrab() {
    const code = lastAnswerCode();
    if (!code) { toast(t().sharpenNone); return; }
    showResult(code, t().sharpenGot, 'ok');
    setTab('prompt');
  }

  function doNewChat() {
    const text = els.out.value;
    if (!text) return;
    writeClipboard(text);
    openChat(text, false, 'open');
  }

  function insertFollowUp(index) {
    const f = followUpsList()[Number(index)];
    if (!f) return;
    /* Counted because rounds of pushing back are the thing the drift warning
     * is actually about — not how long the chat has been open. */
    state.pushes = (state.pushes || 0) + 1;
    if (insertIntoComposer(f.text[state.lang])) { toast(t().followInserted); setTimeout(close, 500); }
    else { writeClipboard(f.text[state.lang]); toast(t().clipboardFallback); }
    renderDrift();
  }

  function focusComposer() {
    const el = composer();
    if (!el) { toast(t().composerFocusUnavailable); return; }
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
    close();
  }

  function repeatTaskContext() {
    const text = state.sentPrompt;
    if (!text) return;
    if (insertIntoComposer(text)) { toast(t().contextRepeated); setTimeout(close, 500); }
    else { writeClipboard(text); toast(t().clipboardFallback); }
  }

  /* How much the length of this chat is now working against the user.
   *   0 — short enough not to mention.
   *   1 — long: say what actually degrades, once.
   *   2 — long AND they have pushed back several times, which is the exact
   *       pattern the measurement describes.
   * Level 2 needs both, because three follow-ups in a four-message chat is
   * someone using the tool, not someone caught in a loop. */
  function driftLevel() {
    const D = R().drift || {};
    /* The site saying so beats any threshold here. ChatGPT puts "This chat is
     * nearing its limit" on the page when the conversation has outgrown the
     * model's context — which is the same problem the handover solves, said by
     * the only party that can actually measure it. */
    if (detectContextFull()) return 2;
    const n = messageCount();
    if (!n || n < (D.messages || 14)) return 0;
    if ((state.pushes || 0) >= (D.pushes || 3)) return 2;
    /* Length alone, for the person who writes their own follow-ups and so
     * never moves the push counter. Without this they never saw the nudge. */
    if (n >= (D.longMessages || 40)) return 2;
    return 1;
  }

  /* Why the drift notice is at the level it is, in one object.
   *
   * "not sure if the feature about it recommending when to reopen a chat works
   * perfectly" — and there was no way to find out, because the inputs were all
   * internal. This is those inputs, and the self-check carries it. A number
   * beside a threshold settles in one glance what a paragraph of guessing
   * cannot. */
  function driftFacts() {
    const D = R().drift || {};
    return {
      level: driftLevel(),
      messages: messageCount(),
      messagesFor1: D.messages || 14,
      pushes: state.pushes || 0,
      pushesFor2: D.pushes || 3,
      messagesFor2: D.longMessages || 40,
      siteSaysFull: !!detectContextFull()
    };
  }

  /* Say that saving has stopped, and offer the one thing that fixes it.
   *
   * Two different failures, and telling them apart matters because only one of
   * them is fixed by reloading:
   *   detached — the extension was updated or reloaded under this page. A
   *              reload reconnects it, and the stored draft is still there.
   *   storage  — the write itself failed, most likely a full quota. Reloading
   *              changes nothing, so the button is not offered.
   *
   * Either way the panel goes on working: everything except persistence is
   * local, and taking the tool away from someone mid-sentence to punish a
   * failure that is not theirs would be the wrong trade. */
  function showDetached(kind) {
    if (!els.detached) return;
    const L = t();
    state.detached = kind;
    els.detachedText.textContent = kind === 'detached' ? L.detachedText : L.storageFullText;
    const btn = els.detached.querySelector('[data-act="reload"]');
    if (btn) btn.hidden = kind !== 'detached';
    els.detached.hidden = false;
    announce(kind === 'detached' ? L.detachedText : L.storageFullText);
  }

  function renderDrift() {
    if (!els.drift) return;
    const D = R().drift || {};
    const lang = state.lang;
    const level = driftLevel();
    els.drift.hidden = !level;
    els.driftNudge.hidden = level < 2;
    if (!level) return;

    const lines = [];
    if (level === 2) {
      lines.push(String((D.pressure && D.pressure[lang]) || '')
        .split('{n}').join(String(state.pushes || 0)));
    }
    lines.push((D.note && D.note[lang]) || '');
    const pid = state.provider && state.provider.id;
    const extra = pid && D.byProvider && D.byProvider[pid] && D.byProvider[pid][lang];
    if (extra) lines.push(extra);

    els.drift.innerHTML = '';
    lines.filter(Boolean).forEach(txt => {
      const p = document.createElement('p');
      p.className = 'ln-drift-line';
      p.textContent = sub(txt);
      els.drift.appendChild(p);
    });
  }

  function doClear() {
    els.text.value = '';
    els.out.value = '';
    FIELDS.forEach(k => { els[k].value = ''; });
    state.manualKind = state.manualGoal = false;
    state.corrected = false;
    state.manualAtText = '';
    state.goal = 'answer';
    state.modelChoice = 'auto';
    if (els.model) els.model.value = 'auto';
    state.parts = [];
    state.collecting = false;
    state.caps = [];
    state.capNote = '';
    state.forceFull = false;
    state.leanPrompt = false;
    state.askFirst = false;
    [els.scope, els.improve, els.sources, els.ignoreMemory].forEach(control => {
      if (control) control.checked = false;
    });
    state.improveExplicit = false;
    state.sentPrompt = '';
    renderFeedbackContext();
    if (els.details) els.details.open = false;
    els.result.hidden = true;
    redetect();
    refresh();
    save();
    els.text.focus();
  }

  function doCopy() {
    if (!els.out.value) return;
    writeClipboard(els.out.value);
    toast(t().copied);
  }

  function doInsert() {
    const text = els.out.value;
    if (!text) return;
    if (insertIntoComposer(text)) {
      state.sentPrompt = text;
      renderFeedbackContext();
      toast(t().inserted);
      setTimeout(close, 500);
    }
    else { writeClipboard(text); toast(t().clipboardFallback); }
    bumpStats((st) => { st.inserted++; });
  }

  /* ------------------------------------------------------------- history */

  function pushHistory(s) {
    const entry = {
      text: s.text, aud: s.audience, fmt: s.format, inc: s.include, avo: s.avoid,
      ctx: s.context, ex: s.example, kind: s.archetype, goal: s.goal, lang: s.lang,
      manualKind: !!s.manualKind, manualGoal: !!s.manualGoal, ts: Date.now()
    };
    state.history = state.history.filter(h => h.text !== entry.text);
    state.history.unshift(entry);
    if (state.history.length > HISTORY_MAX) state.history.length = HISTORY_MAX;
    renderHistory();
    saveHistory();
  }

  function renderHistory() {
    els.hist.hidden = !state.history.length;
    els.histList.innerHTML = '';
    state.history.forEach((h, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ln-hist-item';
      b.dataset.hist = String(i);
      b.textContent = (h.text || '').slice(0, 70) + ((h.text || '').length > 70 ? '…' : '');
      els.histList.appendChild(b);
    });
  }

  function restoreHistory(i) {
    const h = state.history[i];
    if (!h) return;
    els.text.value = h.text || '';
    els.aud.value = h.aud || '';
    els.fmt.value = h.fmt || '';
    els.inc.value = h.inc || '';
    els.avo.value = h.avo || '';
    els.ctx.value = h.ctx || '';
    els.ex.value = h.ex || '';
    state.lang = h.lang || state.lang;
    state.manualKind = h.manualKind === true;
    state.manualGoal = h.manualGoal === true;
    state.corrected = state.manualKind || state.manualGoal;
    state.manualAtText = state.corrected ? (h.text || '') : '';
    if (state.manualGoal && h.goal) state.goal = h.goal;
    applyLang();
    if (state.manualKind && h.kind) els.kind.value = h.kind;
    redetect();
    refresh();
    save();
    els.text.focus();
  }

  /* -------------------------------------------------------------- helpers */

  function writeClipboard(text) {
    try {
      const p = navigator.clipboard && navigator.clipboard.writeText(text);
      if (p && p.catch) p.catch(() => legacyCopy(text));
      else legacyCopy(text);
    } catch (e) { legacyCopy(text); }
  }

  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }

  function sharpenedPreservesSource(code, source) {
    const normal = (value) => String(value || '')
      .replace(/&(lt|gt|amp|quot|#39);/gi, (_match, entity) => ({
        lt: '<', gt: '>', amp: '&', quot: '"', '#39': "'"
      }[entity.toLowerCase()] || ''))
      .replace(/\s+/g, ' ').trim().toLowerCase();
    const expected = normal(source);
    // Markup-bearing source needs the normal XML escape path, where a strict
    // literal comparison would reject a safe result just because tags escaped.
    if (expected.length < 24 || /[<>]/.test(expected)) return true;
    return normal(code).indexOf(expected) !== -1;
  }

  function writableComposer(element) {
    const accepts = candidate => {
      if (!candidate || candidate.disabled || candidate.readOnly ||
          (candidate.getAttribute && candidate.getAttribute('aria-disabled') === 'true')) return false;
      const tag = String(candidate.tagName || '').toLowerCase();
      return tag === 'textarea' || tag === 'input' || candidate.isContentEditable === true ||
        (candidate.getAttribute && /^(true|plaintext-only)$/i.test(candidate.getAttribute('contenteditable') || ''));
    };
    if (accepts(element)) return element;
    try {
      const nested = element && element.querySelector && element.querySelector(
        '[contenteditable="true"], [contenteditable="plaintext-only"], textarea, input[type="text"]'
      );
      return accepts(nested) ? nested : null;
    } catch (e) { return null; }
  }

  function composer() {
    const dom = state.provider && state.provider.dom;
    const configured = dom && dom.composer;
    const selectors = Array.isArray(configured) ? configured :
      (configured ? [configured] : [
        '#prompt-textarea',
        'form div[contenteditable="true"]',
        'div[contenteditable="true"]'
      ]);

    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        const writable = writableComposer(element);
        if (writable) return writable;
      } catch (e) {}
    }
    return null;
  }

  /* ChatGPT's composer is a ProseMirror contenteditable, not a textarea.
   * A synthetic paste event is the reliable way in: ProseMirror handles it
   * natively and keeps line breaks. execCommand is the fallback, and the
   * clipboard is the fallback to the fallback. */
  function composerText(el) {
    if (!el) return '';
    const raw = ('value' in el && typeof el.value === 'string') ? el.value : (el.innerText || '');
    return String(raw).replace(/\u00a0/g, ' ');
  }

  /* Put text at the end of whatever is already in the composer.
   *
   * Appending rather than replacing is deliberate — a half-written draft is
   * not Lantern's to throw away. But appending with nothing in between ran
   * the two together: a user who had typed "und noch etwas" and then pressed a
   * follow-up got "und noch etwasWas spricht gegen diese Antwort?", one
   * sentence, no space. So a blank line goes in first whenever there is
   * already something there.
   *
   * The separator is a newline and not Enter. Enter sends on all three sites;
   * a pasted line break does not. Lantern never presses send. */
  function insertIntoComposer(text) {
    const el = composer();
    if (!el) return false;
    const before = composerText(el);
    if (before.trim() && !/\n\s*$/.test(before)) text = '\n\n' + text;
    const tag = String(el.tagName || '').toLowerCase();
    if ((tag === 'textarea' || tag === 'input') && typeof el.value === 'string') {
      const next = before + text;
      try {
        const proto = Object.getPrototypeOf(el);
        const value = proto && Object.getOwnPropertyDescriptor(proto, 'value');
        if (value && value.set) value.set.call(el, next);
        else el.value = next;
      } catch (e) { el.value = next; }
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
      return true;
    }
    el.focus();
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}

    let ok = false;
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      ok = !el.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt, bubbles: true, cancelable: true
      }));
    } catch (e) { ok = false; }
    if (!ok) {
      try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    }
    return ok;
  }

  /* Put the handle where it belongs for the current state.
   *
   * Closed, it is welded to the right edge of the window. Open, it detaches
   * and rides on the panel's left side like the tab on a folder — which means
   * it has to follow the panel, and the panel is draggable and resizable. So
   * this is called from applyBox and from the drag loop as well as from
   * open/close, and it reads the panel's real box rather than assuming one. */
  function placeFab() {
    if (!fab) return;
    const open = panel && !panel.hidden;
    fab.dataset.open = open ? '1' : '';
    if (!open) {
      fab.style.left = '';
      fab.style.top = '';
      fab.style.right = '';
      fab.style.transform = '';
      return;
    }
    const r = panel.getBoundingClientRect();
    // The tab grows to 34px on hover. If the panel sits closer than that to
    // the left edge, keeping the tab visible would clip it off-screen.
    if (r.left < 35) {
      fab.hidden = true;
      return;
    }
    fab.hidden = false;
    const h = fab.offsetHeight || 108;
    /* Sits just below the panel's top corner rather than centred on it: level
     * with the header reads as attached to the window, centred reads as
     * floating beside it. Clamped so a panel dragged near the bottom of the
     * screen cannot push the handle off it. */
    const top = Math.max(8, Math.min(r.top + 14, window.innerHeight - h - 8));

    /* Anchored by its RIGHT edge, not its left.
     *
     * The obvious version — left = panel.left - fab.offsetWidth — reads the
     * handle's own width, and the handle is mid-transition from 18px to 26px
     * at exactly that moment, so it landed eight pixels under the panel and
     * the name was clipped. Anchoring the right edge to the panel's left edge
     * needs no width at all, so it is correct before, during and after the
     * animation. */
    fab.style.left = 'auto';
    fab.style.transform = 'none';
    fab.style.right = Math.max(0, window.innerWidth - Math.round(r.left) - 1) + 'px';
    fab.style.top = top + 'px';
  }

  function open() {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    els.intro.hidden = state.introSeen;
    if (!state.introSeen) renderIntroTabs();
    if (state.box) applyBox(state.box);
    placeFab();
    state.model = detectModel();
    renderModel();
    checkStatus();
    onAnswerChanged();
    enablePage();
    setTimeout(() => els.text.focus(), 30);
  }

  function close() {
    clearTimeout(inputTimer);
    save();
    /* Only take focus back if it was ours. Escape reaches us while the user is
     * typing in ChatGPT's composer, and "insert into chat" deliberately leaves
     * the caret there — which is exactly where the user wants it. */
    let ours = false;
    try {
      const sr = root.getRootNode();
      ours = !!(sr && sr.activeElement && panel.contains(sr.activeElement));
    } catch (e) {}
    panel.hidden = true;
    fab.hidden = false;
    placeFab();
    fab.setAttribute('aria-expanded', 'false');
    stopSelfCheck();
    disablePage();
    if (ours) { try { fab.focus({ preventScroll: true }); } catch (e) {} }
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.setAttribute('data-show', '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.removeAttribute('data-show'), 3200);
  }

  /* --------------------------------------------------------------- state */

  function save() {
    STORE.set({
      lnDraft: {
        text: els.text.value, aud: els.aud.value, fmt: els.fmt.value,
        inc: els.inc.value, avo: els.avo.value, ctx: els.ctx.value, ex: els.ex.value,
        scope: els.scope.checked,
        /* modelChoice, not tier. Until 0.10.0 this wrote the *derived* tier,
         * which nothing read, while restore() read modelChoice, which nothing
         * wrote — so overruling the model by hand quietly did not survive a
         * reload. Found by writing down the schema. */
        modelChoice: state.modelChoice || 'auto',
        improve: els.improve.checked, improveExplicit: !!state.improveExplicit,
        sources: els.sources.checked,
        ignoreMemory: els.ignoreMemory.checked,
        kind: state.manualKind ? els.kind.value : null,
        goal: state.manualGoal ? state.goal : null,
        manualAtText: state.manualAtText,
        parts: state.parts,
        collecting: state.collecting,
        caps: state.caps || [],
        lang: state.manualLang ? state.lang : null
      }
    });
  }

  function saveHistory() {
    STORE.set({ lnHistory: state.history });
  }

  function saveSettings() {
    state.settingsRaw = Object.assign({}, state.settingsRaw || {},
      { introSeen: state.introSeen, tennis: !!state.tennis });
    try { STORE.set({ lnSettings: state.settingsRaw }); } catch (e) {}
  }

  function setRulesOverride(raw) {
    const records = (list) => Array.isArray(list) && list.length > 0 && list.every(entry =>
      !!entry && typeof entry === 'object' && !Array.isArray(entry) &&
      typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 64
    );
    const valid = raw && typeof raw === 'object' && !Array.isArray(raw) &&
      typeof raw.version === 'string' &&
      /^\d{1,3}(?:\.\d{1,3}){0,2}$/.test(raw.version || '') &&
      String(raw.version).split('.').every(part => Number(part) <= 999) &&
      records(raw.archetypes) && records(raw.goals);
    if (valid) {
      window.LN_RULES_OVERRIDE = raw;
      return true;
    }
    try { delete window.LN_RULES_OVERRIDE; } catch (e) { window.LN_RULES_OVERRIDE = undefined; }
    return false;
  }

  function resetStoredState() {
    state.lang = (navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
    state.manualLang = false;
    state.manualKind = false;
    state.manualGoal = false;
    state.corrected = false;
    state.improveExplicit = false;
    state.manualAtText = '';
    state.box = null;
    state.settingsRaw = {};
    state.modelChoice = 'auto';
    state.tab = 'prompt';
    state.routing = null;
    state.usefulness = null;
    state.introSeen = false;
    state.history = [];
    state.parts = [];
    state.queue = [];
    state.collecting = false;
    state.answer = null;
    state.answerText = '';
    state.capturing = false;
    state.sharpenBefore = '';
    state.sharpenStarted = 0;
    state.sharpenSource = '';
    state.sentPrompt = '';
    state.showAllFollowUps = false;
    state.showFollowAnyway = false;
    state.pageLayer = true;
    state.statusOn = false;
    state.textSize = 'normal';
    state.accent = 'green';
    state.status = null;
    state.handover = '';
    state.lastAdapted = [];
    state.carry = '';
    state.carryAutoInsert = false;
    state.mvWaiting = 0;
    state.mvBefore = '';
    state.mvParts = ['decisions'];
    state.tennis = false;
    state.caps = [];
    state.capNote = '';
    state.forceFull = false;
    state.leanPrompt = false;
    state.askFirst = false;
    state.detached = null;
    lastAnswerKey = '';

    els.text.value = '';
    els.out.value = '';
    FIELDS.forEach(k => { els[k].value = ''; });
    if (els.mvOut) els.mvOut.value = '';
    if (els.mvNext) els.mvNext.value = '';
    if (els.result) els.result.hidden = true;
    if (els.details) els.details.open = false;
    if (els.status) els.status.hidden = true;
    if (els.detached) els.detached.hidden = true;
    if (els.qList) els.qList.innerHTML = '';
    if (panel) {
      ['left', 'top', 'width', 'height', 'right', 'bottom'].forEach(prop => { panel.style[prop] = ''; });
    }

    stopSelfCheck();
    applyLook();
    applyLang();
    redetect();
    renderHistory();
    renderQueue();
    renderMove();
    refresh();
    updateBadge();
    if (panel && !panel.hidden) {
      renderIntroTabs();
      if (els.intro) els.intro.hidden = false;
      enablePage();
      placeFab();
    }
  }

  function restore() {
    try {
      /* An extension update, a reload from chrome://extensions, or the user
       * disabling and re-enabling Lantern all detach this script from its
       * extension. Nothing throws and nothing looks wrong — the panel keeps
       * building prompts perfectly, because that is all local — but every save
       * from that moment is a no-op, and the draft goes at the next reload.
       *
       * It is worth being loud about precisely because it looks fine. */
      STORE.onFail(showDetached);

      STORE.load((v) => {
        v = v || {};
        if (v.lnRulesOverride) setRulesOverride(v.lnRulesOverride);

        const d = v.lnDraft || {};
        els.text.value = d.text || '';
        els.aud.value = d.aud || '';
        els.fmt.value = d.fmt || '';
        els.inc.value = d.inc || '';
        els.avo.value = d.avo || '';
        els.ctx.value = d.ctx || '';
        els.ex.value = d.ex || '';
        if (typeof d.scope === 'boolean') els.scope.checked = d.scope;
        if (d.modelChoice) state.modelChoice = d.modelChoice;
        if (typeof d.improve === 'boolean') els.improve.checked = d.improve;
        state.improveExplicit = d.improveExplicit === true;
        if (typeof d.sources === 'boolean') els.sources.checked = d.sources;
        if (typeof d.ignoreMemory === 'boolean') els.ignoreMemory.checked = d.ignoreMemory;
        state.manualAtText = d.manualAtText || '';
        state.parts = Array.isArray(d.parts) ? d.parts : [];
        state.collecting = !!d.collecting || state.parts.length > 0;
        /* Filtered against the list this build knows, so a stored id from a
         * newer rules file cannot put a chip in the prompt that nothing here
         * can explain. */
        {
          const known = (R().capabilities && R().capabilities.list) || [];
          state.caps = (Array.isArray(d.caps) ? d.caps : []).filter(c => known.indexOf(c) !== -1);
        }

        // Draft first, then settings — an explicit choice in the popup is the
        // more recent, more deliberate instruction and must win.
        if (d.lang) { state.lang = d.lang; state.manualLang = true; }
        if (d.kind) state.manualKind = true;
        if (d.goal) { state.goal = d.goal; state.manualGoal = true; }
        state.corrected = !!(d.kind || d.goal);

        const st = v.lnSettings || {};
        state.settingsRaw = st;
        if (st.box) { state.box = st.box; }
        state.introSeen = !!st.introSeen;
        state.tennis = !!st.tennis;
        if (st.lang) { state.lang = st.lang; state.manualLang = true; }
        else if (st.lang === null && !d.lang) state.manualLang = false;

        state.history = Array.isArray(v.lnHistory) ? v.lnHistory.slice(0, HISTORY_MAX) : [];
        state.queue = Array.isArray(v.lnQueue) ? v.lnQueue : [];
        if (v.lnHandover && v.lnHandover.text) state.handover = v.lnHandover.text;
        if (typeof st.pageLayer === 'boolean') state.pageLayer = st.pageLayer;
        state.statusOn = st.statusCheck === true;   // opt-in, never a default
        state.textSize = TEXT_SIZES[st.textSize] ? st.textSize : 'normal';
        state.accent = ACCENTS.indexOf(st.accent) !== -1 ? st.accent : 'green';
        applyLook();

        // Was this tab opened by the sharpen button, recently enough to still
        // be the run that opened it?
        const sh = v.lnSharpen;
        if (IS_SHARPEN_TAB && sh && (Date.now() - sh.ts) < SHARPEN_WINDOW) {
          state.capturing = true;
          if (sh.lang) { state.lang = sh.lang; state.manualLang = true; }
        }

        // ...or by one of the other hand-offs, which carry the text instead of
        // waiting for one. Same freshness window, same reasoning.
        const carry = v.lnCarry;
        const carryFresh = carry && carry.text && (Date.now() - carry.ts) < SHARPEN_WINDOW;
        if (IS_HANDOFF_TAB && carryFresh) {
          state.carry = carry.text;
          state.carryAutoInsert = carry.autoInsert === true;
          if (carry.lang) { state.lang = carry.lang; state.manualLang = true; }
        }
        /* A sharpen hand-off always arrives with an explicit insert step. This
         * prevents an undocumented provider URL parameter from ever sending a
         * message without the person's action. */
        if (state.capturing && carryFresh) {
          state.carry = carry.text;
          state.carryAutoInsert = false;
        }

        applyLang();
        if (d.kind) els.kind.value = d.kind;
        redetect();
        renderHistory();
        refresh();

        if (state.capturing) {
          open();
          els.intro.hidden = true;
          if (state.carry) {
            showResult(state.carry, t().sharpenSendFirst, 'ask');
            STORE.remove('lnCarry');
            state.carry = '';
          } else {
            showResult('', t().sharpenWaiting, 'ask');
          }
          els.result.scrollIntoView({ block: 'start' });
        } else if (state.carry && state.carryAutoInsert) {
          autoInsertCarry();
        } else if (state.carry) {
          /* Open, not folded to the edge. The person pressed a button in the
           * other tab; this tab is the second half of that one action, and
           * making them click Lantern again to finish it is the same as not
           * having carried anything. */
          open();
          els.intro.hidden = true;
          showResult(state.carry, t().carryReady, 'ok');
          STORE.remove('lnCarry');
          state.carry = '';
        }
      });
    } catch (e) {
      applyLang();
      refresh();
    }
  }

  /* A self-test the popup can ask for.
   *
   * Every selector in this extension is an educated guess about someone else's
   * markup. When one misses, the feature fails silently — which is right for
   * not breaking the page, and useless for working out why nothing happened.
   * This turns that silence into something a person can report. */
  try {
    chrome.runtime.onMessage.addListener((msg, _s, respond) => {
      if (!msg || msg.type !== 'LN_DIAG') return;
      const answers = nodes('assistant', '[data-message-author-role="assistant"]').length;
      const userMsgs = nodes('user', '[data-message-author-role="user"]').length;
      respond({
        running: true,
        version: (R().version || '?'),
        panel: !!panel,
        composer: !!composer(),
        messagesFound: answers + userMsgs,
        answerReadable: !!(state.answer && state.answer.present),
        codeBlock: !!lastAnswerCode(),
        provider: state.provider ? state.provider.id : null,
        model: state.model ? cap(state.model) : '',
        effort: detectEffort(),
        pageLayer: !!(window.LN_INPAGE && window.LN_INPAGE.isOn()),
        lang: state.lang
      });
      return true;
    });
  } catch (e) {}

  /* Settings changed in the popup should reach an already-open panel. */
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (!panel || area !== 'local') return;
      if (changes.lnSchema && changes.lnSchema.newValue === undefined) {
        resetStoredState();
        return;
      }
      const rulesChanged = !!changes.lnRulesOverride;
      if (rulesChanged) setRulesOverride(changes.lnRulesOverride.newValue);
      if (!changes.lnSettings) {
        if (rulesChanged) {
          applyLang();
          redetect();
          refresh();
        }
        return;
      }
      const raw = changes.lnSettings.newValue;
      const st = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      state.settingsRaw = st;
      const wasPageLayer = state.pageLayer;
      state.pageLayer = st.pageLayer !== false;
      if (!panel.hidden && wasPageLayer !== state.pageLayer) {
        state.pageLayer ? enablePage() : disablePage();
      }
      const wasStatusOn = state.statusOn;
      state.statusOn = st.statusCheck === true;
      if (!state.statusOn) {
        state.status = null;
        renderStatus();
      } else if (!wasStatusOn && !panel.hidden) {
        checkStatus();
      }
      state.box = st.box && typeof st.box === 'object' && !Array.isArray(st.box) ? st.box : null;
      if (!panel.hidden) {
        if (state.box) applyBox(state.box);
        else {
          ['left', 'top', 'width', 'height', 'right', 'bottom'].forEach(prop => { panel.style[prop] = ''; });
          placeFab();
        }
      }
      state.textSize = TEXT_SIZES[st.textSize] ? st.textSize : 'normal';
      state.accent = ACCENTS.indexOf(st.accent) !== -1 ? st.accent : 'green';
      applyLook();
      state.tennis = st.tennis === true;
      if (els.helpList && !els.help.hidden) renderHelp();
      state.introSeen = st.introSeen === true;
      if (!panel.hidden) {
        els.intro.hidden = state.introSeen;
        if (!state.introSeen) renderIntroTabs();
      }
      if (st.lang === 'de' || st.lang === 'en') { state.lang = st.lang; state.manualLang = true; }
      else {
        state.lang = (navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
        state.manualLang = false;
      }
      applyLang();
      redetect();
      refresh();
    });
  } catch (e) {}

  /* chatgpt.com is a single-page app; a route change can detach appended nodes. */
  function guard() {
    setInterval(() => {
      const rootNode = root && root.getRootNode();
      const host = rootNode && rootNode.host;
      if (host && !host.isConnected) document.documentElement.appendChild(host);
    }, 3000);
  }

  mount();
  restore();
  guard();
})();

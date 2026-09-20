const langSel = document.getElementById('lang');
const pageChk = document.getElementById('pagelayer');
const statusChk = document.getElementById('statuscheck');
const updateChk = document.getElementById('updatecheck');
const introBtn = document.getElementById('intro');
const introDone = document.getElementById('introDone');
const rv = document.getElementById('rv');
const rulesUrl = document.getElementById('rulesUrl');
const sizeSeg = document.getElementById('sizeSeg');
const accentSeg = document.getElementById('accentSeg');
const updateBox = document.getElementById('updateBox');
const updateTitle = document.getElementById('updateTitle');
const updateBody = document.getElementById('updateBody');
const updateGuide = document.getElementById('updateGuide');
const updateRelease = document.getElementById('updateRelease');

/* Held here rather than read back off the DOM, because these two are the only
 * settings whose control is a row of buttons rather than a checkbox, and a
 * pressed state is not a value. */
const TEXT_SIZES = ['small', 'normal', 'gross', 'sehr', 'riesig'];
const ACCENTS = ['green', 'blue', 'violet', 'rose', 'slate'];
let textSize = 'normal', accent = 'green';

function paintLook() {
  sizeSeg.querySelectorAll('button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.size === textSize)));
  accentSeg.querySelectorAll('button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.accent === accent)));
  /* The popup wears the chosen colour too. Otherwise you pick one here, see
   * nothing change, and have to go and open a chat to find out what you did. */
  const sw = accentSeg.querySelector('button[data-accent="' + accent + '"]');
  if (sw) document.documentElement.style.setProperty('--accent', getComputedStyle(sw).backgroundColor);
}

let uiLang = (navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';

function defaultLanguage() {
  return (navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
}

function extensionVersion() {
  try { return chrome.runtime.getManifest().version || ''; } catch (e) { return ''; }
}

/* The popup is not standing in any assistant — it is the same window whichever
 * site you came from — so {ai} becomes a neutral word rather than a guess. */
function strings() {
  const base = (window.LN_I18N && window.LN_I18N[uiLang]) || (window.LN_I18N && window.LN_I18N.en) || {};
  const out = {};
  Object.keys(base).forEach(k => {
    const v = base[k];
    out[k] = (typeof v === 'string' && v.indexOf('{ai}') !== -1)
      ? v.split('{ai}').join(uiLang === 'de' ? 'der Assistent' : 'the assistant') : v;
  });
  return out;
}

function applyLang() {
  const L = strings();
  document.querySelectorAll('[data-t]').forEach(el => {
    const v = L[el.dataset.t];
    if (typeof v === 'string') el.textContent = v;
  });
  document.querySelectorAll('[data-t-label]').forEach(el => {
    const v = L[el.dataset.tLabel];
    if (typeof v === 'string') el.setAttribute('aria-label', v);
  });
  document.documentElement.lang = uiLang;
}

function loadSettings(v) {
  const s = (v && v.lnSettings && typeof v.lnSettings === 'object' && !Array.isArray(v.lnSettings))
    ? v.lnSettings : {};
  langSel.value = s.lang === 'de' || s.lang === 'en' ? s.lang : 'auto';
  pageChk.checked = s.pageLayer !== false;
  statusChk.checked = s.statusCheck === true;   // opt-in
  if (updateChk) updateChk.checked = s.updateCheck !== false;
  rulesUrl.value = typeof s.rulesUrl === 'string' ? s.rulesUrl : '';
  textSize = TEXT_SIZES.indexOf(s.textSize) !== -1 ? s.textSize : 'normal';
  accent = ACCENTS.indexOf(s.accent) !== -1 ? s.accent : 'green';
  paintLook();
  if (s.lang) uiLang = s.lang;
  /* The manifest is the one version number that cannot drift out of date. */
  const base = extensionVersion();
  rv.textContent = (v && v.lnRulesOverride && v.lnRulesOverride.version) || base || '–';
  applyLang();
  refreshUpdateNotice();
}

if (window.LN_STORE) window.LN_STORE.load(loadSettings);
else chrome.storage.local.get(['lnSettings', 'lnRulesOverride'], loadSettings);

/* `done` matters: chrome.storage is asynchronous, and "Check now" reads the
 * address back out of storage in the service worker. Firing the check without
 * waiting meant it used the *previous* address — which passed the test some
 * runs and failed others, the worst kind of green. */
function persist(extra, done) {
  try {
    chrome.storage.local.get(['lnSettings'], (v) => {
      let error = null;
      try { error = chrome.runtime.lastError; } catch (e) { error = e; }
      if (error) {
        if (done) done(null, String(error.message || error));
        return;
      }
      const s = Object.assign({}, (v && v.lnSettings) || {}, {
        lang: langSel.value === 'auto' ? null : langSel.value,
        pageLayer: pageChk.checked,
        statusCheck: statusChk.checked,
        updateCheck: !updateChk || updateChk.checked,
        textSize: textSize,
        accent: accent,
        rulesUrl: rulesUrl.value.trim()
      }, extra || {});
      if (window.LN_STORE) window.LN_STORE.set({ lnSettings: s }, done);
      else chrome.storage.local.set({ lnSettings: s }, done);
    });
  } catch (e) {
    if (done) done(null, String(e.message || e));
  }
}

langSel.addEventListener('change', () => {
  uiLang = langSel.value === 'auto'
    ? ((navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en')
    : langSel.value;
  applyLang();
  persist();
});

pageChk.addEventListener('change', () => persist());
statusChk.addEventListener('change', () => persist());
if (updateChk) updateChk.addEventListener('change', () => persist(null, () => refreshUpdateNotice()));

function updateText(template, version) {
  return String(template || '').replace('{v}', version || '');
}

function refreshUpdateNotice() {
  if (!updateBox) return;
  updateBox.hidden = true;
  try {
    chrome.runtime.sendMessage({ type: 'LN_UPDATE_STATUS' }, (update) => {
      if (chrome.runtime.lastError || !update || !update.available || !update.version) return;
      const L = strings();
      if (updateTitle) updateTitle.textContent = updateText(L.pUpdateTitle, update.version);
      if (updateBody) updateBody.textContent = L.pUpdateBody || '';
      updateBox.hidden = false;
    });
  } catch (e) {}
}

function openUpdateTarget(type) {
  try { chrome.runtime.sendMessage({ type: type }); } catch (e) {}
}

if (updateGuide) updateGuide.addEventListener('click', () => openUpdateTarget('LN_OPEN_UPDATE_GUIDE'));
if (updateRelease) updateRelease.addEventListener('click', () => openUpdateTarget('LN_OPEN_UPDATE_RELEASE'));

/* Delegated, so the five swatches and five sizes need no per-button wiring and
 * a sixth of either would work by being in the markup. */
sizeSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-size]');
  if (!b) return;
  textSize = b.dataset.size;
  paintLook();
  persist();
});
accentSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-accent]');
  if (!b) return;
  accent = b.dataset.accent;
  paintLook();
  persist();
});

const diagBtn = document.getElementById('diag');
const diagOut = document.getElementById('diagOut');

/* Ask the content script what it can actually see on the current page. */
diagBtn.addEventListener('click', () => {
  const L = strings();
  diagOut.hidden = false;
  diagOut.textContent = '…';
  let answered = false;
  const fail = () => { if (!answered) { answered = true; render(null); } };
  setTimeout(fail, 1200);

  /* Built with DOM calls rather than innerHTML.
   *
   * Mozilla's linter flagged the string-concatenation version, and it was
   * right to: the values interpolated in are interface strings and page-derived
   * text, and a rules file fetched from a URL can supply interface strings. One
   * of those containing a tag would have been parsed as markup. Nothing here is
   * worth an innerHTML for. */
  function mark(ok) {
    const s = document.createElement('span');
    s.className = ok ? 'yes' : 'no';
    s.textContent = ok ? '✓' : '✗';
    return s;
  }

  function render(d) {
    diagOut.textContent = '';
    if (!d || !d.running) {
      const row = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = L.pDiagOff;
      row.appendChild(mark(false));
      row.appendChild(b);
      diagOut.appendChild(row);
      return;
    }
    const rows = [
      [L.pDiagPanel, d.panel],
      [L.pDiagComposer, d.composer],
      [L.pDiagMessages, d.messagesFound > 0, d.messagesFound ? String(d.messagesFound) : ''],
      [L.pDiagModel, !!d.model, d.model ? d.model : ''],
      [L.pDiagPage, d.pageLayer]
    ];
    rows.forEach(([label, ok, extra]) => {
      const row = document.createElement('div');
      row.appendChild(mark(ok));
      const txt = document.createElement('span');
      txt.textContent = label;
      row.appendChild(txt);
      if (extra) {
        const b = document.createElement('b');
        b.textContent = extra;
        row.appendChild(b);
      }
      diagOut.appendChild(row);
    });
  }

  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return fail();
      chrome.tabs.sendMessage(tabs[0].id, { type: 'LN_DIAG' }, (resp) => {
        if (chrome.runtime.lastError) return fail();
        if (answered) return;
        answered = true;
        render(resp);
      });
    });
  } catch (e) { fail(); }
});

introBtn.addEventListener('click', () => {
  persist({ introSeen: false });
  introDone.hidden = false;
});

/* Reset. The escape hatch for a user whose stored state has gone wrong —
 * without it, the only recovery is devtools, which for the people this is
 * built for means it stays broken. Two clicks, because it throws away their
 * draft and history. */
const resetBtn = document.getElementById('reset');
const resetConfirm = document.getElementById('resetConfirm');
const resetDone = document.getElementById('resetDone');
const resetFailed = document.getElementById('resetFailed');

resetBtn.addEventListener('click', () => {
  resetConfirm.hidden = false;
  resetDone.hidden = true;
  resetFailed.hidden = true;
});
document.getElementById('resetNo').addEventListener('click', () => { resetConfirm.hidden = true; });
document.getElementById('resetYes').addEventListener('click', () => {
  const done = (error) => {
    resetConfirm.hidden = true;
    if (error) {
      resetDone.hidden = true;
      resetFailed.hidden = false;
      return;
    }
    resetDone.hidden = false;
    resetFailed.hidden = true;
    langSel.value = 'auto';
    pageChk.checked = true;
    statusChk.checked = false;
    if (updateChk) updateChk.checked = true;
    rulesUrl.value = '';
    textSize = 'normal';
    accent = 'green';
    paintLook();
    uiLang = defaultLanguage();
    diagOut.hidden = true;
    diagOut.textContent = '';
    rulesOut.hidden = true;
    rulesOut.textContent = '';
    rv.textContent = extensionVersion() || '–';
    applyLang();
    refreshUpdateNotice();
  };
  if (window.LN_STORE) window.LN_STORE.reset(done);
  else done();
});

/* The rules update channel.
 *
 * This was a `const RULES_URL = null` in the source until 0.10.0 — an update
 * mechanism the README promised and that had never run. Now it is a setting,
 * every failure has a name, and the name is shown here rather than swallowed.
 * The host must send Access-Control-Allow-Origin; that is deliberate, because
 * the alternative is asking every user for access to every site. */
const rulesCheck = document.getElementById('rulesCheck');
const rulesOut = document.getElementById('rulesOut');

function showRules(r) {
  const L = strings();
  rulesOut.hidden = false;
  rulesOut.innerHTML = '';
  const row = document.createElement('div');
  const ok = !!(r && r.ok);
  let why;
  if (ok) {
    why = (L.pRulesOk || '').replace('{v}', r.version || '?');
  } else {
    // background.js names reasons with hyphens; i18n keys cannot carry those.
    // An HTTP status is reported verbatim — "404" is the most useful single
    // fact when someone has typed the address slightly wrong.
    const raw = (r && r.reason) || 'unreachable';
    if (raw.indexOf('http-') === 0) {
      why = (L.pRules_http || L.pRules_unreachable).replace('{s}', raw.slice(5));
    } else {
      why = L['pRules_' + raw.replace(/-/g, '_')] || L.pRules_unreachable;
    }
  }
  const m = document.createElement('span');
  m.className = ok ? 'yes' : 'no';
  m.textContent = ok ? '✓' : '✗';
  const w = document.createElement('span');
  w.textContent = why;
  row.appendChild(m);
  row.appendChild(w);
  rulesOut.appendChild(row);
  if (ok && r.version) rv.textContent = r.version;
}

rulesUrl.addEventListener('change', () => { persist(); rulesOut.hidden = true; });

rulesCheck.addEventListener('click', () => {
  rulesOut.hidden = false;
  rulesOut.textContent = '…';
  let answered = false;
  const fail = () => { if (!answered) { answered = true; showRules({ ok: false, reason: 'unreachable' }); } };
  setTimeout(fail, 12000);
  // Store the address first, then check it — see persist().
  persist(null, (_result, error) => {
    if (error) { fail(); return; }
    try {
      chrome.runtime.sendMessage({ type: 'LN_REFRESH_RULES' }, (r) => {
        if (answered) return;
        answered = true;
        if (chrome.runtime.lastError) return showRules({ ok: false, reason: 'unreachable' });
        showRules(r);
      });
    } catch (e) { fail(); }
  });
});

/* What Lantern has actually been doing.
 *
 * The router's threshold is a judgement call and so is every keyword list
 * behind it, and until now nothing recorded whether those calls were right.
 * The histogram is the instrument: it shows where this user's requests
 * actually score against the line the router draws. If their scores cluster
 * at 3 and they keep pressing "sharpen" anyway, the line is in the wrong
 * place — and that is a thing they can now see and report, rather than a
 * thing only I could guess at.
 *
 * Counters only, never a word of what anyone wrote, and shown to the person
 * they are about. A statistic its subject cannot read is not measurement. */
const THRESHOLD = 4;

function renderStats(st) {
  const L = strings();
  const box = document.getElementById('statsBox');
  const out = document.getElementById('statsOut');
  const total = (st.built || 0) + (st.sharpened || 0);
  if (!total) { box.hidden = true; return; }
  box.hidden = false;
  out.innerHTML = '';

  const line = (label, value) => {
    const d = document.createElement('div');
    d.className = 'line';
    const a = document.createElement('span'); a.textContent = label;
    const b = document.createElement('b'); b.textContent = value;
    d.appendChild(a); d.appendChild(b); out.appendChild(d);
  };

  line(L.pStatsBuilt, String(st.built || 0));
  line(L.pStatsSharpened, String(st.sharpened || 0));
  line(L.pStatsInserted, String(st.inserted || 0));

  const decided = (st.followed || 0) + (st.against || 0);
  if (decided) {
    line(L.pStatsFollowed, Math.round((st.followed / decided) * 100) + '%');
  }
  if (st.overrode) line(L.pStatsOverrode, String(st.overrode));

  // Which kinds of task actually fire — the first real data on whether the
  // fifteen archetypes are the right fifteen.
  const kinds = Object.keys(st.kinds || {})
    .map(k => [k, st.kinds[k]])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (kinds.length) {
    const d = document.createElement('div');
    d.className = 'kinds';
    d.textContent = L.pStatsKinds + ' ' + kinds.map(([k, n]) => k + ' (' + n + ')').join(', ');
    out.appendChild(d);
  }

  const buckets = [];
  for (let i = 0; i <= 10; i++) buckets.push((st.scores || {})['s' + i] || 0);
  const max = Math.max.apply(null, buckets);
  if (max > 0) {
    const cap = document.createElement('div');
    cap.className = 'kinds';
    cap.textContent = L.pStatsScores;
    out.appendChild(cap);

    const hist = document.createElement('div');
    hist.className = 'hist';
    buckets.forEach((n, i) => {
      const b = document.createElement('div');
      b.className = 'b' + (i >= THRESHOLD ? ' over' : '') + (n === 0 ? ' zero' : '');
      b.style.height = Math.max(2, Math.round((n / max) * 34)) + 'px';
      b.title = L.pStatsBucket.replace('{s}', String(i)).replace('{n}', String(n));
      hist.appendChild(b);
    });
    out.appendChild(hist);

    const ax = document.createElement('div');
    ax.className = 'hist-ax';
    buckets.forEach((_, i) => {
      const sp = document.createElement('span');
      if (i === THRESHOLD) sp.className = 'mark';
      sp.textContent = String(i);
      ax.appendChild(sp);
    });
    out.appendChild(ax);

    const note = document.createElement('div');
    note.className = 'kinds';
    note.textContent = L.pStatsThreshold.replace('{t}', String(THRESHOLD));
    out.appendChild(note);
  }
}

try {
  chrome.storage.local.get(['lnStats'], (v) => {
    if (v && v.lnStats) renderStats(v.lnStats);
  });
} catch (e) {}

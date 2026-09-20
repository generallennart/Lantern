/* Lantern — service worker.
 * Deliberately tiny. It opens tabs and refreshes the rules file.
 * It never calls any OpenAI endpoint and never touches the user's session.
 */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'LN_OPEN_TAB' && typeof msg.url === 'string') {
    chrome.tabs.create({ url: msg.url, active: true });
    sendResponse({ ok: true });
    return true;
  }

  if (msg && msg.type === 'LN_REFRESH_RULES') {
    refreshRules().then(sendResponse);
    return true; // async
  }

  if (msg && msg.type === 'LN_UPDATE_STATUS') {
    checkForUpdate(false).then(sendResponse);
    return true;
  }

  if (msg && msg.type === 'LN_OPEN_UPDATE_GUIDE') {
    try { chrome.tabs.create({ url: chrome.runtime.getURL('GIT-UPDATE-ANLEITUNG.html'), active: true }); } catch (e) {}
    sendResponse({ ok: true });
    return true;
  }

  if (msg && msg.type === 'LN_OPEN_UPDATE_RELEASE') {
    checkForUpdate(false).then(update => {
      if (update && update.available && update.url) {
        try { chrome.tabs.create({ url: update.url, active: true }); } catch (e) {}
        sendResponse({ ok: true });
      } else sendResponse({ ok: false });
    });
    return true;
  }
});

/* ---------------------------------------------------------------------------
 * Keeping advice current without shipping a new extension version.
 *
 * The structural part of the engine (role / task / context / format / quality)
 * is stable across model generations. What ages is the model-specific advice:
 * `modelTips`, `modelTiers`, the archetype `requirements`, the follow-ups. That
 * lives entirely in rules.js and can be replaced at runtime by a JSON file of
 * the same shape.
 *
 * Until 0.10.0 this was a `const RULES_URL = null` in the source — code that
 * had never once run, promising an update channel that did not exist. It is now
 * a setting the user (or whoever deployed this) fills in, and every branch below
 * is exercised by the local regression suite against a controlled response.
 *
 * No new host permission is required, and deliberately so: a store reviewer
 * reading "this extension may read data on all sites" would be right to ask
 * why. Instead the fetch is an ordinary cross-origin request, so **the file's
 * host must send `Access-Control-Allow-Origin`**. Whoever hosts the rules file
 * controls that header; anyone who does not control the host has no business
 * being the source of truth for what this extension tells people.
 * ------------------------------------------------------------------------- */

const FETCH_TIMEOUT = 8000;
const MAX_BYTES = 1024 * 1024;   // a rules file is ~80 KB; 1 MB is generous
const UPDATE_API = 'https://api.github.com/repos/generallennart/Lantern/releases/latest';
const UPDATE_RELEASE_PREFIX = 'https://github.com/generallennart/Lantern/releases/tag/';
const UPDATE_TTL = 24 * 60 * 60 * 1000;
const UPDATE_MAX_BYTES = 64 * 1024;
const UPDATE_ALARM = 'ln-update-check';

/* https anywhere, or plain http on the loopback host.
 *
 * The loopback exception is not a convenience. Without it this whole feature
 * can only be tested by publishing something to the internet first, which is
 * how a feature ends up shipping untested — which is exactly what happened to
 * this one. */
function usableUrl(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let u;
  try { u = new URL(raw); } catch (e) { return null; }
  if (u.username || u.password) return null;
  if (u.protocol === 'https:') return u.href;
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return u.href;
  return null;
}

function validRuleVersion(version) {
  if (typeof version !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){0,2}$/.test(version)) return false;
  return version.split('.').every(part => Number(part) <= 999);
}

/* The same bar the stored copy is held to. A file that is not recognisably a
 * rules file is not one, whatever it claims, and the bundled rules stay. */
function hasRuleIds(list) {
  return Array.isArray(list) && list.length > 0 && list.every(entry =>
    !!entry && typeof entry === 'object' && !Array.isArray(entry) &&
    typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 64
  );
}

function looksLikeRules(d) {
  return !!d && typeof d === 'object' && !Array.isArray(d) &&
    validRuleVersion(d.version) &&
    hasRuleIds(d.archetypes) && hasRuleIds(d.goals);
}

/* "1.2.10" > "1.2.9". Lexical comparison gets this backwards, and getting it
 * backwards means a stale file can permanently replace a newer one. */
function newerThan(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

function installedVersion() {
  try { return String(chrome.runtime.getManifest().version || '0.0.0'); } catch (e) { return '0.0.0'; }
}

function validExtensionVersion(value) {
  if (typeof value !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){2}$/.test(value)) return null;
  return value.split('.').every(part => Number(part) <= 999) ? value : null;
}

function versionFromReleaseTag(tag) {
  if (typeof tag !== 'string') return null;
  const match = /^v(\d{1,3}(?:\.\d{1,3}){2})$/.exec(tag);
  return match && validExtensionVersion(match[1]);
}

function cachedUpdate(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.checkedAt !== 'number' || !isFinite(raw.checkedAt)) return null;
  const version = raw.version ? validExtensionVersion(raw.version) : null;
  return { checkedAt: raw.checkedAt, version: version || '' };
}

function updateResult(enabled, cached) {
  const version = cached && cached.version;
  const available = !!enabled && !!version && newerThan(version, installedVersion());
  return available ? {
    enabled: true,
    available: true,
    version: version,
    url: UPDATE_RELEASE_PREFIX + 'v' + version
  } : { enabled: !!enabled, available: false };
}

function paintUpdateBadge(update) {
  try {
    if (!chrome.action) return;
    chrome.action.setBadgeText({ text: update && update.available ? '!' : '' });
    if (update && update.available) chrome.action.setBadgeBackgroundColor({ color: '#0f7a5a' });
  } catch (e) {}
}

async function updateSettings() {
  try {
    const value = await chrome.storage.local.get(['lnSettings', 'lnUpdate']);
    return {
      enabled: !value || !value.lnSettings || value.lnSettings.updateCheck !== false,
      cached: cachedUpdate(value && value.lnUpdate)
    };
  } catch (e) { return { enabled: false, cached: null }; }
}

async function rememberUpdate(record) {
  try { await chrome.storage.local.set({ lnUpdate: record }); } catch (e) {}
}

async function fetchLatestRelease() {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT);
  let response;
  try {
    response = await fetch(UPDATE_API, {
      cache: 'no-cache',
      credentials: 'omit',
      redirect: 'error',
      headers: { Accept: 'application/vnd.github+json' },
      signal: ac.signal
    });
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
  if (!response.ok) { clearTimeout(timer); return null; }

  let body;
  try { body = await readResponseText(response, UPDATE_MAX_BYTES); }
  catch (e) { clearTimeout(timer); return null; }
  clearTimeout(timer);
  if (body.tooLarge || String(body.text || '').length > UPDATE_MAX_BYTES) return null;

  let data;
  try { data = JSON.parse(body.text); } catch (e) { return null; }
  if (!data || typeof data !== 'object' || data.draft === true || data.prerelease === true) return null;
  return versionFromReleaseTag(data.tag_name);
}

async function checkForUpdate(force) {
  const settings = await updateSettings();
  if (!settings.enabled) {
    const disabled = { enabled: false, available: false };
    paintUpdateBadge(disabled);
    return disabled;
  }

  const cached = settings.cached;
  if (!force && cached && Date.now() - cached.checkedAt < UPDATE_TTL) {
    const known = updateResult(true, cached);
    paintUpdateBadge(known);
    return known;
  }

  const version = await fetchLatestRelease();
  if (!version) {
    const fallback = updateResult(true, cached);
    if (!cached) await rememberUpdate({ checkedAt: Date.now() });
    paintUpdateBadge(fallback);
    return fallback;
  }

  const next = { checkedAt: Date.now(), version: version };
  await rememberUpdate(next);
  const result = updateResult(true, next);
  paintUpdateBadge(result);
  return result;
}

function scheduleUpdateCheck() {
  try { chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: 24 * 60 }); } catch (e) {}
}

async function readResponseText(response, maxBytes) {
  const body = response && response.body;
  if (!body || typeof body.getReader !== 'function') return { text: await response.text() };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (!chunk || chunk.done) break;
      const value = chunk.value;
      if (!value) continue;
      bytes += value.byteLength || value.length || 0;
      if (bytes > maxBytes) {
        try {
          const cancelled = reader.cancel();
          if (cancelled && typeof cancelled.catch === 'function') cancelled.catch(() => {});
        } catch (e) {}
        return { tooLarge: true };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text: text };
  } finally {
    try { reader.releaseLock(); } catch (e) {}
  }
}

async function settings() {
  try {
    const v = await chrome.storage.local.get(['lnSettings', 'lnRulesOverride']);
    return { s: (v && v.lnSettings) || {}, current: (v && v.lnRulesOverride) || null };
  } catch (e) { return { s: {}, current: null }; }
}

async function refreshRules() {
  const { s, current } = await settings();
  const url = usableUrl(s.rulesUrl);
  if (!url) return { ok: false, reason: s.rulesUrl ? 'bad-url' : 'no-url' };

  let res;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT);
  try {
    res = await fetch(url, { cache: 'no-cache', signal: ac.signal, credentials: 'omit', redirect: 'error' });
  } catch (e) {
    clearTimeout(timer);
    // An abort and a CORS refusal both land here, and they mean very different
    // things to whoever has to fix it.
    return { ok: false, reason: ac.signal.aborted ? 'timeout' : 'unreachable' };
  }
  if (!res.ok) { clearTimeout(timer); return { ok: false, reason: 'http-' + res.status }; }

  const len = parseInt(res.headers.get('content-length') || '0', 10);
  if (len > MAX_BYTES) { clearTimeout(timer); return { ok: false, reason: 'too-large' }; }

  let body;
  try { body = await readResponseText(res, MAX_BYTES); }
  catch (e) {
    clearTimeout(timer);
    return { ok: false, reason: ac.signal.aborted ? 'timeout' : 'unreadable' };
  }
  clearTimeout(timer);
  if (body.tooLarge) return { ok: false, reason: 'too-large' };
  const text = body.text;
  // content-length can lie or be absent behind compression, so the real length
  // is checked too.
  if (text.length > MAX_BYTES) return { ok: false, reason: 'too-large' };

  let data;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, reason: 'not-json' }; }
  if (!looksLikeRules(data)) return { ok: false, reason: 'malformed' };

  /* Never go backwards. A server rolled back, a stale CDN edge, or a mirror of
   * an old file would otherwise pin every user to old advice with no signal
   * that anything was wrong. */
  const bundled = data.replaces || null;   // optional, for a file that says what it supersedes
  const currentVersion = current && validRuleVersion(current.version) ? current.version : null;
  if (currentVersion && !newerThan(data.version, currentVersion) &&
      data.version !== currentVersion) {
    return { ok: false, reason: 'older', version: data.version, have: currentVersion };
  }

  try {
    await chrome.storage.local.set({
      lnRulesOverride: data,
      lnRulesFetchedAt: Date.now()
    });
  } catch (e) { return { ok: false, reason: 'store-failed' }; }

  return { ok: true, version: data.version, replaced: bundled };
}

/* ---------------------------------------------------------------------------
 * "Is it me, or is it broken?"
 *
 * When a provider is having an incident, answers get slower, shorter and worse
 * — and the user blames their own prompt, because nothing on the page tells
 * them otherwise. That is a question Lantern is well placed to answer and
 * nobody else is answering inside the chat window.
 *
 * This is the ONLY thing in the extension that contacts anything, so:
 *   - it is off until switched on,
 *   - it fetches one public status file and sends nothing at all — no request
 *     body, no credentials, no identifiers, not even which page you are on,
 *   - the result is cached for five minutes so opening the panel repeatedly
 *     does not turn into traffic,
 *   - and it needs no host permission, because Statuspage serves CORS.
 *
 * The explainer's privacy card says all of this in the user's own language;
 * if that ever stops being true, that card is the thing to fix first.
 * ------------------------------------------------------------------------- */
const STATUS_TTL = 5 * 60 * 1000;
const statusCache = {};

async function fetchStatus(url) {
  if (!url || !/^https:\/\//.test(url)) return { ok: false, reason: 'no-url' };

  const hit = statusCache[url];
  if (hit && (Date.now() - hit.at) < STATUS_TTL) return hit.value;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 6000);
  let res;
  try {
    res = await fetch(url, { cache: 'no-cache', signal: ac.signal, credentials: 'omit' });
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, reason: ac.signal.aborted ? 'timeout' : 'unreachable' };
  }
  clearTimeout(timer);
  if (!res.ok) return { ok: false, reason: 'http-' + res.status };

  let data;
  try { data = await res.json(); } catch (e) { return { ok: false, reason: 'not-json' }; }

  /* Statuspage's shape: status.indicator is one of none / minor / major /
   * critical, and status.description is a human sentence. Anything else means
   * the format changed, and guessing at a replacement is how a status light
   * ends up lying. */
  const ind = data && data.status && data.status.indicator;
  if (typeof ind !== 'string') return { ok: false, reason: 'malformed' };

  const value = {
    ok: true,
    indicator: ind,
    healthy: ind === 'none',
    description: String((data.status.description || '')).slice(0, 160),
    at: Date.now()
  };
  statusCache[url] = { at: Date.now(), value };
  return value;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'LN_STATUS') {
    fetchStatus(msg.url).then(sendResponse);
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => { refreshRules(); checkForUpdate(false); scheduleUpdateCheck(); });
chrome.runtime.onStartup.addListener(() => { refreshRules(); checkForUpdate(false); scheduleUpdateCheck(); });
try {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm && alarm.name === UPDATE_ALARM) checkForUpdate(false);
  });
} catch (e) {}

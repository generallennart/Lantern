/* Lantern — storage schema, migration and validation.
 * ---------------------------------------------------------------------------
 * Everything Lantern keeps lives in chrome.storage.local, and until 0.10.0 it
 * was eight keys that accreted one per feature, each read with an ad-hoc guard
 * at the point of use. That works until a stored shape and the code that reads
 * it disagree — and then the panel breaks for a user who has no way to clear it
 * short of devtools, which for the audience this is built for means it is simply
 * broken forever.
 *
 * So: one version stamp, one migration path, one validator, one reset.
 *
 * Two different jobs, deliberately separated:
 *
 *   migrate()   handles *known* changes between versions — a renamed field, a
 *               dropped feature. It runs once, when the stamp is behind.
 *   validate()  handles *corruption* — a value of the wrong type, a truncated
 *               write, a hand-edited record, or data from a build newer than
 *               this one. It runs on every single load, forever.
 *
 * Validation strips what it cannot read rather than rejecting the record, so a
 * single bad field costs the user that field and not their whole draft. What it
 * cannot repair it drops, and the panel comes up empty instead of not at all.
 *
 * Loaded before engine.js and content.js, and by the popup, so both sides of
 * the extension agree on what is stored.
 */
(function () {
  'use strict';

  var VERSION = 2;

  /* Every key Lantern owns. Reset clears exactly this list, so a key that is
   * not here is a key that leaks. */
  var KEYS = [
    'lnSchema',         // { v }
    'lnDraft',          // the request being written
    'lnSettings',       // popup settings
    'lnHistory',        // recent requests
    'lnSharpen',        // a sharpen run in flight
    'lnCarry',          // a prompt handed to a tab Lantern just opened
    'lnHandover',       // a collected handover
    'lnQueue',          // messages written now, to be sent by hand later
    'lnStats',          // local counters, never sent anywhere
    'lnRulesOverride',  // hosted rules, if a URL is configured
    'lnRulesFetchedAt',
    'lnUpdate'          // public GitHub release version, never release text
  ];

  /* Caps. A corrupt or malicious write should not be able to fill the 5 MB
   * quota, and a 20,000-word paste kept eight times over would come close. */
  var MAX_TEXT = 40000;      // one request
  var MAX_HIST_TEXT = 4000;  // a history entry only needs to be recognisable
  var MAX_HISTORY = 8;
  var MAX_PARTS = 12;
  var MAX_QUEUE = 20;

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function hasRuleIds(v) {
    return Array.isArray(v) && v.length > 0 && v.every(function (entry) {
      return isObj(entry) && typeof entry.id === 'string' &&
        entry.id.length > 0 && entry.id.length <= 64;
    });
  }

  /* ---------------------------------------------------------- failure paths */

  var failListeners = [];
  var failedAlready = '';

  function announce(kind, detail) {
    if (failedAlready === kind) return;   // once per kind, not once per keystroke
    failedAlready = kind;
    failListeners.forEach(function (fn) { try { fn(kind, detail); } catch (e) {} });
  }

  /* Every storage callback has to come through here.
   *
   * chrome.runtime.lastError is not an exception — it is a property that has to
   * be READ inside the callback. Ignoring it means two things at once: Chrome
   * logs "Unchecked runtime.lastError" for every failed write, and the code
   * believes the write succeeded. Reading it turns a silent data loss into
   * something the panel can tell the user about. */
  function checked(kind, cb, arg) {
    var err = null;
    try { err = chrome.runtime.lastError; } catch (e) { err = { message: 'context gone' }; }
    if (err) {
      var live = true;
      try { live = !!(chrome && chrome.runtime && chrome.runtime.id); } catch (e) { live = false; }
      announce(live ? 'storage' : 'detached', String(err.message || err));
    }
    if (cb) { try { cb(arg, err ? String(err.message || err) : null); } catch (e) {} }
  }

  function str(v, cap) {
    if (typeof v !== 'string') return undefined;
    return cap && v.length > cap ? v.slice(0, cap) : v;
  }
  function bool(v) { return typeof v === 'boolean' ? v : undefined; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : undefined; }
  function ruleVersion(v) {
    if (typeof v !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){0,2}$/.test(v)) return undefined;
    return v.split('.').every(function (part) { return Number(part) <= 999; }) ? v : undefined;
  }
  function releaseVersion(v) {
    if (typeof v !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){2}$/.test(v)) return undefined;
    return v.split('.').every(function (part) { return Number(part) <= 999; }) ? v : undefined;
  }
  function ident(v) { // an archetype/goal/language id
    return (typeof v === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(v)) ? v : undefined;
  }

  /* Assign only the fields that survive their check, so a bad field is lost
   * and its neighbours are not. */
  function pick(out, src, map) {
    Object.keys(map).forEach(function (k) {
      var v = map[k](src[k]);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }

  var CHECK = {
    lnDraft: function (d) {
      if (!isObj(d)) return undefined;
      return pick({}, d, {
        text: function (v) { return str(v, MAX_TEXT); },
        aud: function (v) { return str(v, 2000); },
        fmt: function (v) { return str(v, 2000); },
        inc: function (v) { return str(v, 2000); },
        avo: function (v) { return str(v, 2000); },
        ctx: function (v) { return str(v, MAX_TEXT); },
        ex: function (v) { return str(v, MAX_TEXT); },
        scope: bool, improve: bool, improveExplicit: bool, sources: bool, ignoreMemory: bool, collecting: bool,
        kind: ident, goal: ident, lang: ident, modelChoice: ident,
        manualAtText: function (v) { return str(v, MAX_TEXT); },
        /* Pieces the user collected instead of sending several messages. Capped
         * hard: this is the one field a person can grow without limit just by
         * pressing a button, and it shares the 5 MB quota with everything
         * else. */
        parts: function (v) {
          if (!Array.isArray(v)) return undefined;
          var out = [];
          for (var i = 0; i < v.length && out.length < MAX_PARTS; i++) {
            var p = str(v[i], MAX_TEXT);
            if (p && p.trim()) out.push(p);
          }
          return out;
        },
        /* Which of the assistant's own capabilities the user picked for this
         * request. A closed vocabulary check would have to live here and in
         * rules.js at once, so the schema only enforces the shape; the panel
         * filters unknown ids against the list it actually knows. */
        caps: function (v) {
          if (!Array.isArray(v)) return undefined;
          var out = [];
          for (var i = 0; i < v.length && out.length < 12; i++) {
            var c = ident(v[i]);
            if (c && out.indexOf(c) === -1) out.push(c);
          }
          return out;
        }
      });
    },

    lnSettings: function (s) {
      if (!isObj(s)) return undefined;
      var out = pick({}, s, {
        pageLayer: bool, introSeen: bool, statusCheck: bool, updateCheck: bool,
        tennis: bool,
        /* How the panel looks. Both are closed sets rather than free values,
         * because both reach CSS: a font size arrives as a variable and an
         * accent as an attribute selector. An unexpected string in either is
         * harmless today and is the kind of thing that stops being harmless
         * later, so it is refused here rather than sanitised at the far end. */
        textSize: function (v) {
          return ['small', 'normal', 'gross', 'sehr', 'riesig'].indexOf(v) !== -1 ? v : undefined;
        },
        accent: function (v) {
          return ['green', 'blue', 'violet', 'rose', 'slate'].indexOf(v) !== -1 ? v : undefined;
        },
        /* Where the user dragged the panel to. Numbers only, and re-clamped to
         * the viewport on every apply, so a stored position from a bigger
         * monitor cannot strand the panel off-screen. */
        box: function (v) {
          if (!isObj(v)) return undefined;
          var out = {};
          ['left', 'top', 'w', 'h'].forEach(function (k) {
            var n = num(v[k]);
            if (n !== undefined) out[k] = Math.max(-10000, Math.min(20000, n));
          });
          return (out.w && out.h) ? out : undefined;
        },
        rulesUrl: function (v) {
          /* https anywhere, or plain http on the loopback host. A stored
           * file://, javascript: or data: URL must never reach fetch(), and
           * this is the gate that stops one that was written by hand, by an
           * older build, or by a bug. Kept in step with usableUrl() in
           * background.js — the two must agree or a URL can be saved and then
           * silently never fetched. */
          if (typeof v !== 'string' || !v) return undefined;
          var u;
          try { u = new URL(v); } catch (e) { return undefined; }
          if (u.username || u.password) return undefined;
          if (u.protocol === 'https:') return v.slice(0, 2000);
          if (u.protocol === 'http:' &&
              (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return v.slice(0, 2000);
          return undefined;
        }
      });
      // lang is the one field whose null is meaningful: "follow the browser".
      if (s.lang === null) out.lang = null;
      else if (ident(s.lang) !== undefined) out.lang = s.lang;
      return out;
    },

    lnHistory: function (h) {
      if (!Array.isArray(h)) return undefined;
      var out = [];
      for (var i = 0; i < h.length && out.length < MAX_HISTORY; i++) {
        if (!isObj(h[i])) continue;
        var e = pick({}, h[i], {
          text: function (v) { return str(v, MAX_HIST_TEXT); },
          aud: function (v) { return str(v, 2000); },
          fmt: function (v) { return str(v, 2000); },
          inc: function (v) { return str(v, 2000); },
          avo: function (v) { return str(v, 2000); },
          ctx: function (v) { return str(v, MAX_HIST_TEXT); },
          ex: function (v) { return str(v, MAX_HIST_TEXT); },
          kind: ident, goal: ident, lang: ident, manualKind: bool, manualGoal: bool, ts: num
        });
        if (e.text) out.push(e);   // an entry with no request is not an entry
      }
      return out;
    },

    lnSharpen: function (s) {
      if (!isObj(s) || num(s.ts) === undefined) return undefined;
      return pick({ ts: s.ts }, s, { lang: ident });
    },

    /* The prompt a hand-off carried into the tab it opened. Same cap as a
     * request, because that is what it is. */
    lnCarry: function (c) {
      if (!isObj(c) || num(c.ts) === undefined) return undefined;
      var text = str(c.text, MAX_TEXT);
      if (!text) return undefined;
      return pick({ ts: c.ts, text: text }, c, { lang: ident, autoInsert: bool });
    },

    lnHandover: function (h) {
      if (!isObj(h)) return undefined;
      var text = str(h.text, MAX_TEXT);
      if (!text) return undefined;
      return { text: text, ts: num(h.ts) || 0 };
    },

    /* Messages the user wrote while they could not send them. Lantern never
     * sends these — it hands them back one click at a time — so this is a
     * notepad, and it is capped like one. */
    lnQueue: function (q) {
      if (!Array.isArray(q)) return undefined;
      var out = [];
      for (var i = 0; i < q.length && out.length < MAX_QUEUE; i++) {
        if (!isObj(q[i])) continue;
        var e = pick({}, q[i], {
          text: function (v) { return str(v, MAX_TEXT); },
          note: function (v) { return str(v, 300); },
          provider: ident, ts: num
        });
        if (e.text && e.text.trim()) out.push(e);
      }
      return out;
    },

    lnStats: function (s) {
      if (!isObj(s)) return undefined;
      var out = { built: num(s.built) || 0, sharpened: num(s.sharpened) || 0,
                  inserted: num(s.inserted) || 0, overrode: num(s.overrode) || 0,
                  followed: num(s.followed) || 0, against: num(s.against) || 0,
                  since: num(s.since) || 0, kinds: {}, scores: {} };
      // Counters only. Nothing here records what anyone wrote.
      ['kinds', 'scores'].forEach(function (bag) {
        if (!isObj(s[bag])) return;
        Object.keys(s[bag]).slice(0, 64).forEach(function (k) {
          if (/^[a-z0-9_-]{1,32}$/.test(k) && num(s[bag][k]) !== undefined) {
            out[bag][k] = Math.max(0, Math.round(s[bag][k]));
          }
        });
      });
      return out;
    },

    lnRulesOverride: function (r) {
      // Held to the same bar as a fetched file: unless it is recognisably a
      // rules file, it is not one, and the bundled rules are used instead.
      if (!isObj(r) || ruleVersion(r.version) === undefined) return undefined;
      if (!hasRuleIds(r.archetypes) || !hasRuleIds(r.goals)) return undefined;
      return r;
    },

    lnRulesFetchedAt: num,

    lnUpdate: function (u) {
      if (!isObj(u) || num(u.checkedAt) === undefined) return undefined;
      var version = releaseVersion(u.version);
      return u.verified === true && version
        ? { checkedAt: u.checkedAt, verified: true, version: version }
        : { checkedAt: u.checkedAt };
    }
  };

  /* Known changes between schema versions.
   *
   * 0 → 1 (0.10.0). Pre-0.10.0 data carries no stamp.
   *   - lnDraft.tier was written on every save and never read, while
   *     lnDraft.modelChoice was read on every restore and never written — so a
   *     manual model override silently did not survive a reload. The field is
   *     dropped here and the write is fixed at the call site; there is nothing
   *     to recover, because the choice was never stored.
   *   - Everything else is carried through validation unchanged. */
  var MIGRATIONS = {
    1: function (data) {
      if (isObj(data.lnDraft)) delete data.lnDraft.tier;
      return data;
    },
    2: function (data) {
      /* Improvement tips used to be enabled by default. Only a new explicit
       * selection should keep them on, so old drafts do not gain an unwanted
       * closing section merely by being opened after the upgrade. */
      if (isObj(data.lnDraft) && data.lnDraft.improveExplicit !== true) {
        delete data.lnDraft.improve;
      }
      if (isObj(data.lnSettings)) delete data.lnSettings.temporaryChat;
      return data;
    }
  };

  /* ------------------------------------------------ the rename, 0.17.1
   *
   * The extension was called Klartext until September 2026 and every storage
   * key began `kt`. Renaming the product renamed the keys, which means a copy
   * already installed has a draft, a history, a queue and a set of settings
   * sitting under names the new build never asks for. Nothing would break —
   * the panel would come up perfectly, empty — which is the worst shape for
   * this kind of loss, because the user has no way to tell it happened.
   *
   * So `load()` asks for both sets of names, and anything found under the old
   * one is copied across and then deleted. It runs once: after the copy there
   * are no `kt` keys left to find.
   *
   * This is a rename, not a schema change, so it is deliberately NOT one of
   * the numbered MIGRATIONS. Those run on a version bump; this has to run for
   * anybody whose stamp already reads 1. */
  var LEGACY_PREFIX = 'kt';
  var LEGACY_KEYS = KEYS.map(function (k) {
    return LEGACY_PREFIX + k.slice(2);          // lnDraft -> ktDraft
  });

  function adoptLegacy(raw) {
    var adopted = [];
    KEYS.forEach(function (k, i) {
      var old = LEGACY_KEYS[i];
      if (raw[k] === undefined && raw[old] !== undefined) {
        raw[k] = raw[old];
        adopted.push(old);
      }
    });
    return adopted;
  }

  function migrate(data) {
    var from = (isObj(data.lnSchema) && num(data.lnSchema.v)) || 0;
    // Data from a *newer* build: do not run migrations backwards, and do not
    // guess. Validation below keeps whatever still makes sense and drops the
    // rest, which is the same thing it does for corruption.
    if (from >= VERSION) return { data: data, migrated: false, from: from };
    for (var v = from + 1; v <= VERSION; v++) {
      if (MIGRATIONS[v]) { try { data = MIGRATIONS[v](data) || data; } catch (e) {} }
    }
    return { data: data, migrated: true, from: from };
  }

  function validate(data) {
    var out = {};
    var dropped = [];   // keys that could not be read at all
    var repaired = [];  // keys that survived but lost or truncated a field
    Object.keys(CHECK).forEach(function (k) {
      if (!(k in data)) return;
      var v;
      try { v = CHECK[k](data[k]); } catch (e) { v = undefined; }
      if (v === undefined) { dropped.push(k); return; }
      out[k] = v;
      /* A field-level repair has to count as a change too. Otherwise the bad
       * field is cleaned on the way out but left in storage, so it is re-read
       * and re-cleaned on every load — and is still sitting there waiting for
       * a later build that reads it less carefully. */
      try {
        if (JSON.stringify(v) !== JSON.stringify(data[k])) repaired.push(k);
      } catch (e) { repaired.push(k); }
    });
    return { data: out, dropped: dropped, repaired: repaired };
  }

  function cleanWrite(obj) {
    var source = isObj(obj) ? obj : {};
    var out = {};
    Object.keys(source).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(CHECK, k)) return;
      var value;
      try { value = CHECK[k](source[k]); } catch (e) { value = undefined; }
      if (value !== undefined) out[k] = value;
    });
    return out;
  }

  var API = {
    VERSION: VERSION,
    KEYS: KEYS.slice(),

    /* Is this content script still attached to a live extension?
     *
     * It stops being attached every time the extension is updated, reloaded or
     * disabled — which for a published extension means *every user with a tab
     * open* on every release. The script keeps running; only the chrome.* APIs
     * die. Reading chrome.runtime.id is the standard test: it throws or comes
     * back undefined once the context is gone.
     *
     * Without this, the failure is silent and expensive: the panel goes on
     * working, the user goes on typing, every save quietly does nothing, and
     * the draft disappears at the next reload. */
    alive: function () {
      try { return !!(chrome && chrome.runtime && chrome.runtime.id); }
      catch (e) { return false; }
    },

    /* Called once per failure, with 'detached' (extension reloaded under us)
     * or 'storage' (the write itself failed — a full quota, most likely).
     * Registered by the panel so it can say so instead of pretending. */
    onFail: function (fn) { if (typeof fn === 'function') failListeners.push(fn); },

    /* Read everything, migrate if needed, validate always, and hand back a
     * clean object. Never rejects: a total failure yields {} and a working
     * panel, because a panel that will not open cannot be reset from the
     * panel. */
    load: function (cb) {
      var done = function (d, info) { try { cb(d, info); } catch (e) {} };
      try {
        chrome.storage.local.get(KEYS.concat(LEGACY_KEYS), function (raw) {
          checked('read', null);
          var data = isObj(raw) ? raw : {};
          /* Anything still under the pre-rename names is adopted here, before
           * migration and validation see the record — so from that point on
           * every other line in this file can assume the new names. */
          var adopted = [];
          try { adopted = adoptLegacy(data); } catch (e) {}
          LEGACY_KEYS.forEach(function (k) { delete data[k]; });
          var m, v;
          try { m = migrate(data); } catch (e) { m = { data: data, migrated: false, from: 0 }; }
          try { v = validate(m.data); } catch (e) { v = { data: {}, dropped: [], repaired: [] }; }

          var info = { from: m.from, migrated: m.migrated, dropped: v.dropped,
                       repaired: v.repaired, version: VERSION, adopted: adopted };
          // Persist the results of a migration or a repair, so the next load is
          // clean and a broken record cannot come back.
          if (m.migrated || v.dropped.length || v.repaired.length || adopted.length) {
            var write = { lnSchema: { v: VERSION } };
            KEYS.forEach(function (k) { if (k !== 'lnSchema' && k in v.data) write[k] = v.data[k]; });
            var gone = v.dropped.filter(function (k) { return !(k in v.data); })
              .concat(adopted);   // the old names go, or they are adopted again forever
            try {
              chrome.storage.local.set(write, function () {
                checked('write', function (_arg, err) {
                  // Do not remove the old record when its replacement failed.
                  // That would turn a temporary quota failure into data loss.
                  if (!err && gone.length) {
                    try {
                      chrome.storage.local.remove(gone, function () { checked('remove', null); });
                    } catch (e) {}
                  }
                  done(v.data, info);
                });
              });
            } catch (e) { done(v.data, info); }
            return;
          }
          done(v.data, info);
        });
      } catch (e) {
        announce(API.alive() ? 'storage' : 'detached', String(e && e.message || e));
        done({}, { from: 0, migrated: false, dropped: [], repaired: [], adopted: [], version: VERSION });
      }
    },

    set: function (obj, cb) {
      try {
        var write = Object.assign({ lnSchema: { v: VERSION } }, cleanWrite(obj));
        chrome.storage.local.set(write, function () { checked('write', cb); });
      } catch (e) {
        announce(API.alive() ? 'storage' : 'detached', String(e && e.message || e));
        if (cb) try { cb(null, String(e && e.message || e)); } catch (e2) {}
      }
    },

    remove: function (keys, cb) {
      try { chrome.storage.local.remove(keys, function () { checked('remove', cb); }); }
      catch (e) {
        announce(API.alive() ? 'storage' : 'detached', String(e && e.message || e));
        if (cb) try { cb(); } catch (e2) {}
      }
    },

    /* The escape hatch. Clears exactly the keys Lantern owns — never the
     * whole of storage, which is not ours to clear.
     *
     * The pre-rename names are included, because "reset everything" that
     * leaves a set of `kt` keys behind has not reset everything, and on the
     * next load they would be adopted straight back in. */
    reset: function (cb) {
      var finish = function (err) {
        if (cb) try { cb(err || null); } catch (e) {}
      };
      var fail = function (err) {
        var detail = String(err && err.message || err);
        announce(API.alive() ? 'storage' : 'detached', detail);
        finish(detail);
      };
      try {
        chrome.storage.local.remove(KEYS.concat(LEGACY_KEYS), function () {
          checked('remove', function (_arg, removeErr) {
            if (removeErr) { finish(removeErr); return; }
            try {
              chrome.storage.local.set({ lnSchema: { v: VERSION } }, function () {
                checked('write', function (_value, writeErr) { finish(writeErr); });
              });
            } catch (e) { fail(e); }
          });
        });
      } catch (e) { fail(e); }
    },

    // exposed for the tests
    LEGACY_KEYS: LEGACY_KEYS.slice(),
    _migrate: migrate,
    _validate: validate,
    _resetFailState: function () { failedAlready = ''; failListeners.length = 0; }
  };

  if (typeof window !== 'undefined') window.LN_STORE = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();

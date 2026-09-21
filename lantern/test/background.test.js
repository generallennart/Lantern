const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadBackground(options) {
  options = options || {};
  const listeners = {};
  const writes = [];
  const badges = [];
  const chrome = {
    action: {
      setBadgeText(value) { badges.push(value); },
      setBadgeBackgroundColor() {}
    },
    alarms: {
      create() {},
      onAlarm: { addListener(listener) { listeners.alarm = listener; } }
    },
    tabs: { create() {} },
    storage: {
      local: {
        async get() { return options.storage || {}; },
        async set(value) { writes.push(value); }
      }
    },
    runtime: {
      getManifest() { return { version: options.version || '1.0.0' }; },
      onMessage: { addListener(listener) { listeners.message = listener; } },
      onInstalled: { addListener(listener) { listeners.installed = listener; } },
      onStartup: { addListener(listener) { listeners.startup = listener; } }
    }
  };
  const sandbox = {
    chrome,
    URL,
    AbortController,
    fetch: options.fetch || (() => { throw new Error('not used by helper tests'); }),
    setTimeout: options.setTimeout || setTimeout,
    clearTimeout: options.clearTimeout || clearTimeout,
    Date,
    Promise,
    TextDecoder,
    Uint8Array,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'background.js'), 'utf8') +
      '\nglobalThis.__backgroundTest = { usableUrl, looksLikeRules, newerThan, refreshRules, fetchStatus, checkForUpdate };',
    sandbox,
    { filename: 'background.js' }
  );
  return Object.assign(sandbox.__backgroundTest, { writes, badges });
}

function officialRelease(version, extra) {
  const tag = 'v' + version;
  const base = 'https://github.com/generallennart/Lantern/releases/download/' + tag + '/';
  return Object.assign({
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [
      { name: 'Lantern-' + version + '.zip', size: 1, browser_download_url: base + 'Lantern-' + version + '.zip' },
      { name: 'Lantern-' + version + '.zip.sha256', size: 1, browser_download_url: base + 'Lantern-' + version + '.zip.sha256' }
    ]
  }, extra || {});
}

test('update checks accept only a newer official GitHub release without credentials', async () => {
  let request = null;
  const background = loadBackground({
    version: '1.0.0',
    storage: { lnSettings: { updateCheck: true } },
    fetch: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        headers: { get() { return null; } },
        async text() { return JSON.stringify(officialRelease('1.0.1')); }
      };
    }
  });

  const result = await background.checkForUpdate(true);

  assert.equal(result.enabled, true);
  assert.equal(result.available, true);
  assert.equal(result.version, '1.0.1');
  assert.equal(result.url, 'https://github.com/generallennart/Lantern/releases/tag/v1.0.1');
  assert.equal(request.url, 'https://api.github.com/repos/generallennart/Lantern/releases/latest');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'error');
  assert.equal(background.badges.at(-1).text, '!');
  assert.equal(background.writes.at(-1).lnUpdate.version, '1.0.1');
  assert.equal(background.writes.at(-1).lnUpdate.verified, true);
});

test('matching, older, or assetless releases never become update notices', async () => {
  const cases = [
    officialRelease('1.1.0'),
    officialRelease('1.0.9'),
    officialRelease('1.1.1', { assets: [] }),
    officialRelease('1.1.2', {
      assets: [
        { name: 'Lantern-1.1.2.zip', size: 1, browser_download_url: 'https://example.invalid/Lantern-1.1.2.zip' },
        { name: 'Lantern-1.1.2.zip.sha256', size: 1, browser_download_url: 'https://example.invalid/Lantern-1.1.2.zip.sha256' }
      ]
    })
  ];

  for (const release of cases) {
    const background = loadBackground({
      version: '1.1.0',
      storage: { lnSettings: { updateCheck: true } },
      fetch: async () => ({
        ok: true,
        headers: { get() { return null; } },
        async text() { return JSON.stringify(release); }
      })
    });

    const result = await background.checkForUpdate(true);
    assert.equal(result.available, false, release.tag_name);
    assert.equal(background.badges.at(-1).text, '', release.tag_name);
  }
});

test('a failed recheck clears a stale cached update notice', async () => {
  const background = loadBackground({
    version: '1.1.0',
    storage: {
      lnSettings: { updateCheck: true },
      lnUpdate: { checkedAt: 1, verified: true, version: '9.9.9' }
    },
    fetch: async () => { throw new Error('offline'); }
  });

  const result = await background.checkForUpdate(true);

  assert.equal(result.available, false);
  assert.equal(background.badges.at(-1).text, '');
  assert.equal(background.writes.at(-1).lnUpdate.verified, false);
});

test('a disabled update check does not contact GitHub or show a badge', async () => {
  let requests = 0;
  const background = loadBackground({
    storage: { lnSettings: { updateCheck: false } },
    fetch: async () => { requests++; throw new Error('must not fetch'); }
  });

  const result = await background.checkForUpdate(true);

  assert.equal(result.enabled, false);
  assert.equal(result.available, false);
  assert.equal(requests, 0);
  assert.equal(background.badges.at(-1).text, '');
});

test('prereleases and malformed tags never become advertised updates', async () => {
  const releases = [
    officialRelease('9.9.9', { prerelease: true }),
    officialRelease('9.9.9', { tag_name: 'latest' })
  ];

  for (const release of releases) {
    const background = loadBackground({
      storage: { lnSettings: { updateCheck: true } },
      fetch: async () => ({
        ok: true,
        headers: { get() { return null; } },
        async text() { return JSON.stringify(release); }
      })
    });

    const result = await background.checkForUpdate(true);
    assert.equal(result.available, false, release.tag_name);
    assert.equal(background.badges.at(-1).text, '', release.tag_name);
  }
});

test('oversized non-stream release metadata never becomes an update', async () => {
  const background = loadBackground({
    storage: { lnSettings: { updateCheck: true } },
    fetch: async () => ({
      ok: true,
      headers: { get() { return null; } },
      async text() { return 'x'.repeat(70000); }
    })
  });

  const result = await background.checkForUpdate(true);

  assert.equal(result.available, false);
  assert.equal(background.badges.at(-1).text, '');
  assert.equal(background.writes.at(-1).lnUpdate.version, undefined);
});

test('rules URLs allow HTTPS and local HTTP but reject unsafe schemes and credentials', () => {
  const background = loadBackground();

  assert.equal(background.usableUrl('https://rules.example/rules.json'), 'https://rules.example/rules.json');
  assert.equal(background.usableUrl('http://localhost:8080/rules.json'), 'http://localhost:8080/rules.json');
  assert.equal(background.usableUrl('http://127.0.0.1/rules.json'), 'http://127.0.0.1/rules.json');
  assert.equal(background.usableUrl('http://rules.example/rules.json'), null);
  assert.equal(background.usableUrl('javascript:alert(1)'), null);
  assert.equal(background.usableUrl('data:application/json,{}'), null);
  assert.equal(background.usableUrl('https://user:secret@rules.example/rules.json'), null);
});

test('rule versions compare numerically rather than lexically', () => {
  const background = loadBackground();

  assert.equal(background.newerThan('1.2.10', '1.2.9'), true);
  assert.equal(background.newerThan('1.2.9', '1.2.10'), false);
  assert.equal(background.newerThan('2.0', '2.0.0'), false);
});

test('rules require the structural fields needed by the runtime overlay', () => {
  const background = loadBackground();

  assert.equal(background.looksLikeRules({
    version: '1.0', archetypes: [{ id: 'write' }], goals: [{ id: 'artifact' }]
  }), true);
  assert.equal(background.looksLikeRules({ version: '1.0', archetypes: [{}], goals: [{}] }), false);
  assert.equal(background.looksLikeRules({ version: '1.0', archetypes: [], goals: [{}] }), false);
  assert.equal(background.looksLikeRules({ version: 1, archetypes: [{}], goals: [{}] }), false);
  assert.equal(background.looksLikeRules({ version: '999999.0.0', archetypes: [{ id: 'write' }], goals: [{ id: 'artifact' }] }), false);
});

test('rules refresh stores a valid response without credentials or user data', async () => {
  let request = null;
  const background = loadBackground({
    storage: { lnSettings: { rulesUrl: 'https://rules.example/rules.json' } },
    fetch: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        headers: { get() { return null; } },
        async text() {
          return JSON.stringify({
            version: '2.0.0', archetypes: [{ id: 'write' }], goals: [{ id: 'artifact' }]
          });
        }
      };
    }
  });

  const result = await background.refreshRules();

  assert.equal(result.ok, true);
  assert.equal(result.version, '2.0.0');
  assert.equal(result.replaced, null);
  assert.equal(request.url, 'https://rules.example/rules.json');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'error');
  assert.equal(background.writes.length, 1);
  assert.equal(background.writes[0].lnRulesOverride.version, '2.0.0');
  assert.equal('lnSchema' in background.writes[0], false,
    'rules refresh must not rewrite the schema version owned by store.js');
});

test('rules refresh rejects malformed responses without replacing the current rules', async () => {
  const background = loadBackground({
    storage: { lnSettings: { rulesUrl: 'https://rules.example/rules.json' } },
    fetch: async () => ({
      ok: true,
      headers: { get() { return null; } },
      async text() { return JSON.stringify({ version: '2.0.0', archetypes: [{}], goals: [{}] }); }
    })
  });

  const result = await background.refreshRules();

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'malformed');
  assert.equal(background.writes.length, 0);
});

test('rules refresh replaces an invalid stored version without requiring a full reset', async () => {
  const background = loadBackground({
    storage: {
      lnSettings: { rulesUrl: 'https://rules.example/rules.json' },
      lnRulesOverride: { version: '999999.0.0', archetypes: [{ id: 'write' }], goals: [{ id: 'artifact' }] }
    },
    fetch: async () => ({
      ok: true,
      headers: { get() { return null; } },
      async text() { return JSON.stringify({ version: '2.0.0', archetypes: [{ id: 'write' }], goals: [{ id: 'artifact' }] }); }
    })
  });

  const result = await background.refreshRules();

  assert.equal(result.ok, true);
  assert.equal(background.writes[0].lnRulesOverride.version, '2.0.0');
});

test('status requests omit credentials and report only public status information', async () => {
  let request = null;
  const background = loadBackground({
    fetch: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        async json() { return { status: { indicator: 'minor', description: 'Delayed responses' } }; }
      };
    }
  });

  const result = await background.fetchStatus('https://status.example/api/v2/status.json');

  assert.equal(result.ok, true);
  assert.equal(result.healthy, false);
  assert.equal(result.description, 'Delayed responses');
  assert.equal(request.options.credentials, 'omit');
});

test('rules refresh keeps its timeout active while reading a response body', async () => {
  let active = true;
  let onTimeout;
  const background = loadBackground({
    storage: { lnSettings: { rulesUrl: 'https://rules.example/rules.json' } },
    setTimeout(callback) { onTimeout = callback; return 1; },
    clearTimeout() { active = false; },
    fetch: async (_url, options) => ({
      ok: true,
      headers: { get() { return null; } },
      async text() {
        if (active) onTimeout();
        throw new Error('body stopped');
      },
      signal: options.signal
    })
  });

  const result = await background.refreshRules();

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timeout');
});

test('rules refresh cancels an oversized unknown-length response stream', async () => {
  let cancelled = false;
  let reads = 0;
  const chunks = [new Uint8Array(700000), new Uint8Array(400000)];
  const background = loadBackground({
    storage: { lnSettings: { rulesUrl: 'https://rules.example/rules.json' } },
    fetch: async () => ({
      ok: true,
      headers: { get() { return null; } },
      body: {
        getReader() {
          return {
            async read() {
              if (reads >= chunks.length) return { done: true };
              return { done: false, value: chunks[reads++] };
            },
            cancel() { cancelled = true; }
          };
        }
      },
      async text() { throw new Error('must not buffer an oversized stream'); }
    })
  });

  const result = await background.refreshRules();

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'too-large');
  assert.equal(cancelled, true);
  assert.equal(background.writes.length, 0);
});
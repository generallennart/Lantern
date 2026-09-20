const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { after, before, test } = require('node:test');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (error) {}

if (!chromium) {
  test('browser gate requires the optional playwright package', { skip: 'Install playwright to run browser checks.' }, () => {});
} else {
  const root = path.join(__dirname, '..');
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  };
  let browser;
  let server;
  let baseUrl;
  let browserUnavailable = '';

  function sendFile(request, response) {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch (error) { response.writeHead(400).end(); return; }
    const relativePath = path.posix.normalize(pathname).replace(/^\/+/, '');
    const filePath = path.resolve(root, relativePath || 'test/panel-preview.html');
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(filePath, (error, contents) => {
      if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(); return; }
      response.writeHead(200, { 'content-type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
      response.end(contents);
    });
  }

  function startServer() {
    server = http.createServer(sendFile);
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        baseUrl = 'http://127.0.0.1:' + address.port;
        resolve();
      });
    });
  }

  function stopServer() {
    return new Promise(resolve => server ? server.close(resolve) : resolve());
  }

  function trapSubmissions() {
    const calls = [];
    window.__lnSubmissionCalls = calls;
    ['submit', 'requestSubmit'].forEach(method => {
      HTMLFormElement.prototype[method] = function () { calls.push(method); };
    });
    document.addEventListener('submit', event => {
      calls.push('submit-event');
      event.preventDefault();
    }, true);
  }

  async function openPreview(options) {
    const page = await browser.newPage();
    const settings = options || {};
    let explainerRequests = 0;
    if (settings.trapSubmissions) await page.addInitScript(trapSubmissions);
    if (settings.failFirstExplainer) {
      await page.route('**/src/explainer.json', route => {
        explainerRequests++;
        return explainerRequests === 1 ? route.abort() : route.continue();
      });
    }
    await page.goto(baseUrl + '/test/panel-preview.html' + (settings.query || ''), { waitUntil: 'load' });
    await page.waitForFunction(() => {
      const host = document.querySelector('#lantern-root');
      return !!(host && host.shadowRoot === null && window.__lnPreviewRoot &&
        window.__lnPreviewRoot.querySelector('.ln-fab'));
    });
    return { page, explainerRequests: () => explainerRequests };
  }

  function openPanel(page) {
    return page.evaluate(() => {
      const root = window.__lnPreviewRoot;
      if (root.querySelector('.ln-panel').hidden) root.querySelector('.ln-fab').click();
    });
  }

  function browserTest(name, callback) {
    test(name, async context => {
      if (!browser) return context.skip('Playwright browser unavailable: ' + browserUnavailable);
      await callback();
    });
  }

  before(async () => {
    await startServer();
    try { browser = await chromium.launch({ headless: true }); }
    catch (error) { browserUnavailable = String(error && error.message || error); }
  });

  after(async () => {
    if (browser) await browser.close();
    await stopServer();
  });

  browserTest('manual result-type correction rebuilds the visible prompt without sending', async () => {
    const { page } = await openPreview({ trapSubmissions: true });
    try {
      assert.equal(await page.evaluate(() => document.querySelector('#lantern-root').shadowRoot), null);
      await openPanel(page);
      await page.evaluate(() => {
        const root = window.__lnPreviewRoot;
        const input = root.querySelector('#ln-text');
        input.value = 'Write a calm email to my landlord about a broken heater and ask for a repair date.';
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      });
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__lnPreviewRoot.querySelector('[data-act="build"]').click());
      const result = await page.evaluate(() => {
        const root = window.__lnPreviewRoot;
        const before = root.querySelector('#ln-out').value;
        const selected = Array.from(root.querySelectorAll('[data-goal]'))
          .find(button => button.getAttribute('aria-checked') === 'true');
        selected.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
        const after = root.querySelector('#ln-out').value;
        const next = Array.from(root.querySelectorAll('[data-goal]'))
          .find(button => button.getAttribute('aria-checked') === 'true');
        return { before, after, selected: selected.dataset.goal, next: next.dataset.goal };
      });

      assert.notEqual(result.selected, result.next);
      assert.notEqual(result.before, result.after);
      assert.deepEqual(await page.evaluate(() => window.__lnSubmissionCalls), []);
    } finally {
      await page.close();
    }
  });

  browserTest('custom follow-up feedback focuses the host chat input without relaying text', async () => {
    const { page } = await openPreview({ trapSubmissions: true });
    try {
      await openPanel(page);
      const result = await page.evaluate(() => {
        const root = window.__lnPreviewRoot;
        root.querySelector('[data-tab="follow"]').click();
        return {
          relayRemoved: !root.querySelector('#ln-feedback') && !root.querySelector('[data-act="feedback"]'),
          hasFocus: document.activeElement === document.querySelector('#prompt-textarea'),
          panelClosed: root.querySelector('.ln-panel').hidden,
          composer: document.querySelector('#prompt-textarea').innerText
        };
      });

      await page.evaluate(() => window.__lnPreviewRoot.querySelector('[data-act="focus-composer"]').click());
      const afterFocus = await page.evaluate(() => ({
        hasFocus: document.activeElement === document.querySelector('#prompt-textarea'),
        panelClosed: window.__lnPreviewRoot.querySelector('.ln-panel').hidden,
        composer: document.querySelector('#prompt-textarea').innerText
      }));

      assert.equal(result.relayRemoved, true);
      assert.equal(result.hasFocus, false);
      assert.equal(result.panelClosed, false);
      assert.equal(afterFocus.hasFocus, true);
      assert.equal(afterFocus.panelClosed, true);
      assert.equal(afterFocus.composer, '');
      assert.deepEqual(await page.evaluate(() => window.__lnSubmissionCalls), []);
    } finally {
      await page.close();
    }
  });

  browserTest('a moved handover fills the fresh composer without submitting', async () => {
    const { page } = await openPreview({ trapSubmissions: true, query: '?provider=claude&handover=auto#ln=open' });
    try {
      await page.waitForFunction(() => document.querySelector('#prompt-textarea').innerText.includes('Continue the client update'));
      const result = await page.evaluate(async () => ({
        composer: document.querySelector('#prompt-textarea').innerText,
        panelClosed: window.__lnPreviewRoot.querySelector('.ln-panel').hidden,
        carryRemoved: await new Promise(resolve => chrome.storage.local.get(['lnCarry'], value => resolve(!value.lnCarry)))
      }));

      assert.equal(result.composer, 'Continue the client update from this handover.');
      assert.equal(result.panelClosed, true);
      assert.equal(result.carryRemoved, true);
      assert.deepEqual(await page.evaluate(() => window.__lnSubmissionCalls), []);
    } finally {
      await page.close();
    }
  });

  browserTest('typing in Lantern stays inside its panel instead of reaching host chat listeners', async () => {
    const { page } = await openPreview();
    try {
      await openPanel(page);
      const result = await page.evaluate(() => {
        const root = window.__lnPreviewRoot;
        const input = root.querySelector('#ln-text');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, composed: true }));
        input.value = 'Private Lantern draft';
        input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, composed: true, inputType: 'insertText', data: 'a' }));
        input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: 'a' }));
        return { value: input.value, hostEvents: window.__lnHostPanelEvents.slice() };
      });

      assert.equal(result.value, 'Private Lantern draft');
      assert.deepEqual(result.hostEvents, []);
    } finally {
      await page.close();
    }
  });

  browserTest('the help panel remains usable and retries a transient explainer fetch failure', async () => {
    const { page, explainerRequests } = await openPreview({ failFirstExplainer: true });
    try {
      await openPanel(page);
      await page.evaluate(() => window.__lnPreviewRoot.querySelector('[data-act="help"]').click());
      await page.waitForTimeout(200);
      const first = await page.evaluate(() => {
        const root = window.__lnPreviewRoot;
        return { cards: root.querySelectorAll('.ln-help-q').length, open: !root.querySelector('.ln-help').hidden };
      });
      await page.evaluate(() => {
        const root = window.__lnPreviewRoot;
        root.querySelector('[data-act="help-close"]').click();
        root.querySelector('[data-act="help"]').click();
      });
      await page.waitForFunction(() => window.__lnPreviewRoot.querySelectorAll('.ln-help-q').length > 0);
      const second = await page.evaluate(() => window.__lnPreviewRoot.querySelectorAll('.ln-help-q').length);

      assert.equal(first.open, true);
      assert.equal(first.cards, 0);
      assert.ok(second > 0);
      assert.equal(explainerRequests(), 2);
    } finally {
      await page.close();
    }
  });
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const inpageSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'inpage.js'),
  'utf8'
);

function inpageFunction(name, nextMarker, dependencies) {
  const start = inpageSource.indexOf('  function ' + name + '(');
  const end = inpageSource.indexOf(nextMarker, start);
  assert.notEqual(start, -1, name + ' should exist');
  assert.notEqual(end, -1, name + ' should have a stable boundary');
  const source = inpageSource.slice(start, end);
  const names = Object.keys(dependencies);
  return new Function(...names, source + '\nreturn ' + name + ';')(
    ...names.map(name => dependencies[name])
  );
}

test('clearing the answer bar never removes an unrelated host element with the old ID', () => {
  let removed = false;
  const foreignBar = {
    parentNode: {
      removeChild() { removed = true; }
    },
    removeAttribute() {},
    classList: { remove() { removed = true; } }
  };
  const clearBar = inpageFunction('clearBar', '\n\n  /* Find the site', {
    barEl: null,
    answerMark: null,
    removeOwned(el) { if (el === foreignBar) removed = true; },
    unmark(record) { if (record && record.el === foreignBar) removed = true; },
    document: { querySelectorAll() { throw new Error('host page must not be queried during teardown'); } }
  });

  clearBar();

  assert.equal(removed, false);
});

test('making room adds to existing body padding instead of replacing it', () => {
  const body = { style: { paddingRight: '24px' } };
  const push = inpageFunction('push', '\n\n  function remember', {
    document: { body },
    ctx: null,
    unpush() {},
    remember() {},
    pushable() { return []; },
    getComputedStyle() { return { paddingRight: '24px' }; },
    inset: 0
  });

  push(100);

  assert.equal(body.style.paddingRight, '124px');
});

test('clearing a Lantern marker restores an existing host attribute value', () => {
  const attributes = { 'data-ln-inpage': 'host-value' };
  const element = {
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; },
    setAttribute(name, value) { attributes[name] = String(value); },
    removeAttribute(name) { delete attributes[name]; }
  };
  const mark = inpageFunction('mark', '\n\n  function unmark', { INPAGE: 'data-ln-inpage' });
  const unmark = inpageFunction('unmark', '\n\n  function removeOwned', { INPAGE: 'data-ln-inpage' });

  const record = mark(element, 'composer-lit');
  assert.equal(attributes['data-ln-inpage'], 'composer-lit');
  unmark(record);

  assert.equal(attributes['data-ln-inpage'], 'host-value');
});

test('capability pointing matches whole control words and ignores navigation controls', () => {
  const retry = {
    getAttribute() { return ''; },
    textContent: 'Versuche es erneut',
    closest() { return null; },
    getBoundingClientRect() { return { width: 100, height: 32 }; }
  };
  const sidebarSearch = {
    getAttribute() { return ''; },
    textContent: 'Suche im Web',
    closest(selector) { return selector.indexOf('nav') !== -1 ? {} : null; },
    getBoundingClientRect() { return { width: 100, height: 32 }; }
  };
  const chatSearch = {
    getAttribute() { return ''; },
    textContent: 'Suche im Chat',
    closest() { return null; },
    getBoundingClientRect() { return { width: 100, height: 32 }; }
  };
  const search = {
    getAttribute() { return ''; },
    textContent: 'Websuche',
    closest() { return null; },
    getBoundingClientRect() { return { width: 100, height: 32 }; }
  };
  const findControl = inpageFunction('findControl', '\n\n  function clearPoint', {
    document: { querySelectorAll() { return [retry, sidebarSearch, chatSearch, search]; } }
  });

  assert.equal(findControl(['websuche', 'suche']), search);
});

test('page-layer refresh reapplies room when a host SPA replaces its layout nodes', () => {
  const calls = [];
  const refresh = inpageFunction('refresh', '\n\n  function disable', {
    on: true,
    ctx: null,
    inset: 420,
    push(value) { calls.push(['push', value]); },
    unpush() { calls.push(['unpush']); },
    lightComposer() { calls.push(['composer']); },
    drawPoint() { calls.push(['point']); },
    drawBar() { calls.push(['bar']); }
  });

  refresh({ makeRoom: true, inset: 420 });

  assert.deepEqual(calls, [['push', 420], ['composer'], ['point'], ['bar']]);
});
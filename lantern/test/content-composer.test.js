const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const contentSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'content.js'),
  'utf8'
);

function composerApi(state, document) {
  const start = contentSource.indexOf('  function writableComposer(');
  const end = contentSource.indexOf("\n\n  /* ChatGPT's composer", start);
  assert.notEqual(start, -1, 'composer helpers should exist');
  assert.notEqual(end, -1, 'composer helpers should have a stable boundary');
  const source = contentSource.slice(start, end);
  return new Function('state', 'document', source + '\nreturn { composer, writableComposer };')(state, document);
}

test('composer prefers the active provider selector over a generic editable region', () => {
  const providerComposer = {
    id: 'provider-composer', tagName: 'DIV', isContentEditable: true,
    getAttribute(name) { return name === 'contenteditable' ? 'true' : ''; }
  };
  const genericComposer = {
    id: 'generic-composer', tagName: 'DIV', isContentEditable: true,
    getAttribute(name) { return name === 'contenteditable' ? 'true' : ''; }
  };
  const queriedSelectors = [];
  const document = {
    querySelector(selector) {
      queriedSelectors.push(selector);
      if (selector === '.provider-composer') return providerComposer;
      if (selector === 'div[contenteditable="true"]') return genericComposer;
      return null;
    }
  };
  const state = {
    provider: {
      dom: {
        composer: ['.provider-composer', 'div[contenteditable="true"]']
      }
    }
  };

  const { composer } = composerApi(state, document);

  assert.equal(composer(), providerComposer);
  assert.deepEqual(queriedSelectors, ['.provider-composer']);
});

test('Claude resolves a chat-input wrapper to its writable editor and ignores an unrelated editor', () => {
  const editor = {
    tagName: 'DIV',
    isContentEditable: true,
    getAttribute(name) { return name === 'contenteditable' ? 'true' : ''; }
  };
  const wrapper = {
    tagName: 'DIV',
    isContentEditable: false,
    getAttribute() { return ''; },
    querySelector(selector) {
      return selector.indexOf('[contenteditable="true"]') !== -1 ? editor : null;
    }
  };
  const unrelated = {
    tagName: 'DIV',
    isContentEditable: true,
    getAttribute(name) { return name === 'contenteditable' ? 'true' : ''; }
  };
  const state = {
    provider: {
      dom: {
        composer: ['[data-testid="chat-input"]', '[contenteditable="true"][role="textbox"]']
      }
    }
  };
  const document = {
    querySelector(selector) {
      if (selector === '[data-testid="chat-input"]') return wrapper;
      if (selector === '[contenteditable="true"][role="textbox"]') return unrelated;
      return null;
    }
  };
  const { composer } = composerApi(state, document);

  assert.equal(composer(), editor);
});
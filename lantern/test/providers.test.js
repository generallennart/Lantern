const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const providers = require(path.join(__dirname, '..', 'src', 'providers.js'));

test('provider detection accepts supported hosts and rejects lookalikes', () => {
  assert.equal(providers.detect('chatgpt.com').id, 'chatgpt');
  assert.equal(providers.detect('chat.openai.com').id, 'chatgpt');
  assert.equal(providers.detect('claude.ai').id, 'claude');
  assert.equal(providers.detect('gemini.google.com').id, 'gemini');
  assert.equal(providers.detect('chatgpt.example.com'), null);
  assert.equal(providers.detect('notclaude.ai'), null);
  assert.equal(providers.detect('gemini.google.com.example.com'), null);
});

test('specific model names win over shorter tier matches', () => {
  assert.equal(providers.tierOf(providers.byId('gemini'), 'Gemini Flash-Lite'), 'fast');
  assert.equal(providers.tierOf(providers.byId('gemini'), 'Gemini Flash'), 'balanced');
  assert.equal(providers.tierOf(providers.byId('claude'), 'Claude Opus 5'), 'deep');
  assert.equal(providers.tierOf(providers.byId('claude'), 'Unknown future model'), 'balanced');
});

test('model labels describe prompt framing rather than a model price or speed ranking', () => {
  const luna = providers.byId('chatgpt').tiers.find(tier => tier.id === 'fast');

  assert.match(luna.label.en, /prompt framing/i);
  assert.equal(/fast|cheap/i.test(luna.label.en), false);
});

test('handoff providers require an explicit insert instead of URL prefill', () => {
  ['chatgpt', 'claude', 'gemini'].forEach(id => {
    assert.equal(providers.byId(id).prefillSupported, false, id + ' must not prefill a message URL');
  });
});

test('provider DOM contracts contain the selectors required by panel features', () => {
  providers.ids().forEach(id => {
    const dom = providers.byId(id).dom;
    ['composer', 'message', 'assistant', 'user', 'code', 'modelPicker'].forEach(key => {
      assert.ok(dom[key], id + ' is missing ' + key);
    });
  });
});

test('Claude composer selectors avoid an unscoped generic editable fallback', () => {
  const selectors = providers.byId('claude').dom.composer;

  assert.equal(selectors.includes('div[contenteditable="true"]'), false);
  assert.ok(selectors.some(selector => selector.indexOf('chat-input') !== -1 || selector.indexOf('ProseMirror') !== -1));
});
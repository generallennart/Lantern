const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadStrings() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n.js'), 'utf8'),
    sandbox,
    { filename: 'i18n.js' }
  );
  return sandbox.window.LN_I18N;
}

test('English and German expose the same nonempty interface-string keys', () => {
  const strings = loadStrings();
  const de = strings.de;
  const en = strings.en;

  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
  Object.keys(de).forEach(key => {
    assert.equal(typeof de[key], typeof en[key], key + ' should have the same value type');
    assert.ok(typeof de[key] === 'function' || String(de[key]).trim(), key + ' should not be empty');
  });
});

test('usefulness guidance is available in both languages', () => {
  const strings = loadStrings();
  const keys = [
    'useClearRequest', 'useQuestionNotTask', 'useOwnPrompt', 'useExternalAction',
    'useSourceMissing', 'useCodeMissing', 'asIsNote', 'externalActionNote',
    'useOutputContract', 'useReordered', 'sourceMissingNote', 'codeMissingNote', 'outputContractNote',
    'reorderedNote', 'autoUpdated', 'a11yUnchanged', 'a11yNeedMaterial', 'a11yOutputContract',
    'a11yReordered', 'adaptReordered', 'verdictReordered',
    'feedbackDirectTitle', 'feedbackDirectAction', 'composerFocusUnavailable',
    'repeatContext', 'contextRepeated',
    'verdictWhy_clearRequest', 'verdictWhy_externalAction', 'verdictWhy_sourceMissing',
    'verdictWhy_codeMissing', 'verdictAddContext'
  ];

  ['de', 'en'].forEach(lang => keys.forEach(key => {
    assert.ok(String(strings[lang][key] || '').trim(), lang + ' is missing ' + key);
  }));
});

test('queue and question labels use singular grammar', () => {
  const strings = loadStrings();

  assert.equal(strings.de.queueAdded(1), 'Abgelegt. 1 Nachricht wartet hier.');
  assert.equal(strings.en.queueAdded(1), 'Parked. 1 message is waiting here.');
  assert.equal(strings.de.pageAnswerQuestions(1), '1 Frage hier beantworten');
  assert.equal(strings.en.pageAnswerQuestions(1), 'Answer 1 question here');
});
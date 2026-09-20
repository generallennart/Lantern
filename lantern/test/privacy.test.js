const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const contentSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'content.js'),
  'utf8'
);

function contentFunction(name, nextMarker, dependencies) {
  const start = contentSource.indexOf('  function ' + name + '(');
  const end = contentSource.indexOf(nextMarker, start);
  assert.notEqual(start, -1, name + ' should exist');
  assert.notEqual(end, -1, name + ' should have a stable boundary');
  const source = contentSource.slice(start, end);
  const names = Object.keys(dependencies);
  return new Function(...names, source + '\nreturn ' + name + ';')(
    ...names.map(name => dependencies[name])
  );
}

test('the production panel uses a closed Shadow DOM', () => {
  assert.match(contentSource, /attachShadow\(\{\s*mode:\s*'closed'\s*\}\)/);
  assert.doesNotMatch(contentSource, /attachShadow\(\{\s*mode:\s*'open'\s*\}\)/);
});

test('diagnostic excerpts redact complete sensitive values before truncating them', () => {
  const withheld = '(withheld: looked like account data)';
  const excerpt = contentFunction('safeReportExcerpt', '\n\n  function selfCheckFacts', {
    safeForReport(text) {
      return /[\w.+-]+@[\w-]+\.[\w.]{2,}/.test(String(text)) ? withheld : String(text);
    }
  });
  const sensitive = 'Model picker for account 8f3c0b21d9e74a55b6c1 - user jane@example.com';

  assert.equal(excerpt(sensitive, 60), withheld);
  assert.equal(excerpt('A short safe label', 8), 'A short ');
  assert.doesNotMatch(contentSource, /safeForReport\([^)]*\.slice\(/);
  assert.match(contentSource, /rawText:\s*around\.replace\(\/\\s\+\/g, ' '\)/);
  assert.match(contentSource, /safeReportExcerpt\(near\.rawText \|\| near\.text, 160\)/);
});
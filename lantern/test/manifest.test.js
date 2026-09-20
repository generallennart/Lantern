const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

test('manifest resources, permissions, and version records describe the shipped extension', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.version, packageInfo.version);
  assert.ok(manifest.name.length <= 45, 'extension name must fit Chrome Web Store limits');
  assert.ok(manifest.description.length <= 132, 'extension description must fit Chrome Web Store limits');
  assert.deepEqual(manifest.permissions.slice().sort(), ['alarms', 'clipboardWrite', 'storage']);
  assert.deepEqual(manifest.host_permissions.slice().sort(), [
    'https://api.github.com/*',
    'https://chat.openai.com/*',
    'https://chatgpt.com/*',
    'https://claude.ai/*',
    'https://gemini.google.com/*'
  ]);

  const content = manifest.content_scripts[0];
  assert.deepEqual(content.js, [
    'src/store.js',
    'src/providers.js',
    'src/rules.js',
    'src/i18n.js',
    'src/engine.js',
    'src/inpage.js',
    'src/content.js'
  ]);

  const resources = [
    manifest.background.service_worker,
    ...content.js,
    ...manifest.web_accessible_resources.flatMap(entry => entry.resources),
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon)
  ];
  resources.forEach(resource => assert.equal(exists(resource), true, resource + ' should exist'));

  const rulesSource = fs.readFileSync(path.join(root, 'src', 'rules.js'), 'utf8');
  assert.match(rulesSource, new RegExp("version: '" + manifest.version.replace(/\./g, '\\.') + "'"));
});

test('shipped code contains no automatic provider send mechanism', () => {
  const shippedJs = ['src', 'popup'].flatMap(directory => fs.readdirSync(path.join(root, directory))
    .filter(file => file.endsWith('.js'))
    .map(file => path.join(root, directory, file)));
  const prohibited = [
    /\.requestSubmit\s*\(/,
    /\.submit\s*\(/,
    /\.click\s*\(/,
    /new\s+KeyboardEvent\s*\(/,
    /key(?:Code)?\s*[:=]\s*(?:13|'Enter'|"Enter")/
  ];

  shippedJs.forEach(file => {
    const source = fs.readFileSync(file, 'utf8');
    prohibited.forEach(pattern => {
      assert.equal(pattern.test(source), false, path.relative(root, file) + ' matched ' + pattern);
    });
  });
});
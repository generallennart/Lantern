const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = __dirname;
const releaseRoot = path.resolve(root, '..');
const dist = path.join(root, 'dist');
const release = path.join(dist, 'release');

const GUIDE = [
  'ANLEITUNG.html',
  'AENDERUNGEN.txt',
  'OFFENE-FRAGEN.txt',
  'ZUERST-LESEN.txt',
  'INSTALLIEREN-MIT-AKTUALISIERUNGEN.cmd',
  'AKTUALISIEREN.cmd'
];
const SHIP = [
  'GIT-UPDATE-ANLEITUNG.html',
  'INSTALL.txt',
  'LICENSE',
  'manifest.json',
  'README.md',
  'TESTING.md',
  'icons/icon128.png',
  'icons/icon16.png',
  'icons/icon48.png',
  'popup/popup.html',
  'popup/popup.js',
  'src/background.js',
  'src/content.js',
  'src/engine.js',
  'src/explainer.json',
  'src/i18n.js',
  'src/inpage.js',
  'src/panel.css',
  'src/providers.js',
  'src/rules.js',
  'src/store.js'
];

function copy(fromRoot, relativePath, toRoot) {
  const source = path.join(fromRoot, relativePath);
  if (!fs.existsSync(source)) throw new Error('Missing release file: ' + relativePath);
  const target = path.join(toRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function exportRules() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'src', 'rules.js'), 'utf8'), sandbox, {
    filename: 'rules.js'
  });
  fs.writeFileSync(path.join(dist, 'rules.json'),
    JSON.stringify(sandbox.window.LN_RULES, null, 2) + '\n');
}

function build() {
  fs.rmSync(dist, { recursive: true, force: true });
  GUIDE.forEach(file => copy(releaseRoot, file, release));
  SHIP.forEach(file => copy(root, file, path.join(release, 'lantern')));
  exportRules();
  process.stdout.write('Staged ' + GUIDE.length + ' guide files and ' + SHIP.length + ' extension files.\n');
}

if (require.main === module) build();

module.exports = { GUIDE, SHIP, build };
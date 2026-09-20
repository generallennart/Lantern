const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const extensionRoot = path.join(__dirname, '..');
const repositoryRoot = path.join(extensionRoot, '..');
const build = require(path.join(extensionRoot, 'build.js'));
const packageInfo = require(path.join(extensionRoot, 'package.json'));

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

test('release staging ships the update scripts and bundled guide', () => {
  assert.ok(build.GUIDE.includes('INSTALLIEREN-MIT-AKTUALISIERUNGEN.cmd'));
  assert.ok(build.GUIDE.includes('AKTUALISIEREN.cmd'));
  assert.ok(build.SHIP.includes('GIT-UPDATE-ANLEITUNG.html'));
  assert.equal(fs.existsSync(path.join(repositoryRoot, 'INSTALLIEREN-MIT-AKTUALISIERUNGEN.cmd')), true);
  assert.equal(fs.existsSync(path.join(repositoryRoot, 'AKTUALISIEREN.cmd')), true);
  assert.equal(fs.existsSync(path.join(extensionRoot, 'GIT-UPDATE-ANLEITUNG.html')), true);
});

test('German install materials explicitly explain extracting the ZIP file', () => {
  const mainGuide = read('ANLEITUNG.html');
  const quickGuide = read('ZUERST-LESEN.txt');
  const installGuide = read('lantern/INSTALL.txt');
  const updateGuide = read('lantern/GIT-UPDATE-ANLEITUNG.html');

  [mainGuide, quickGuide, installGuide, updateGuide].forEach(text => {
    assert.match(text, /Alle extrahieren/);
    assert.match(text, /Extrahieren/);
  });
  assert.match(mainGuide, /Komprimierter ZIP-Ordner/);
  assert.match(installGuide, /nicht in der \.zip-Datei/);
});

test('the Windows updater fast-forwards only the official repository', () => {
  const installer = read('INSTALLIEREN-MIT-AKTUALISIERUNGEN.cmd');
  const updater = read('AKTUALISIEREN.cmd');

  assert.match(installer, /https:\/\/github\.com\/generallennart\/Lantern\.git/);
  assert.match(installer, /git clone --branch main --single-branch/);
  assert.match(installer, /if exist "%TARGET%\\lantern\\GIT-UPDATE-ANLEITUNG\.html"/);
  assert.match(updater, /git remote get-url origin/);
  assert.match(updater, /https:\/\/github\.com\/generallennart\/Lantern\.git/);
  assert.match(updater, /git branch --show-current/);
  assert.match(updater, /git status --porcelain/);
  assert.match(updater, /git pull --ff-only origin main/);
  assert.doesNotMatch(installer + updater, /Invoke-WebRequest|curl\.exe|powershell .*ExecutionPolicy/i);
});

test('the release workflow verifies before publishing a tagged archive', () => {
  const workflow = read('.github/workflows/release.yml');

  assert.match(workflow, /tags:\s*\n\s*- 'v\*\.\*\.\*'/);
  assert.match(workflow, /npm run release:check/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /npm run audit:usefulness/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /sha256sum/);
});

test('release metadata checker accepts the current stable version', () => {
  const tag = 'v' + packageInfo.version;
  const output = childProcess.execFileSync(process.execPath, ['tools/release-check.js'], {
    cwd: extensionRoot,
    env: Object.assign({}, process.env, { GITHUB_REF_NAME: tag }),
    encoding: 'utf8'
  });

  assert.match(output, new RegExp('Release metadata is consistent for ' +
    packageInfo.version.replace(/\./g, '\\.') + ' \\(' + tag.replace(/\./g, '\\.') + '\\)\\.'));
});

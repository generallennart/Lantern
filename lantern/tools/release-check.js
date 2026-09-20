const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  process.stderr.write('Release check failed: ' + message + '\n');
  process.exitCode = 1;
}

const manifest = JSON.parse(read('manifest.json'));
const packageInfo = JSON.parse(read('package.json'));
const version = manifest.version;
const tag = process.env.GITHUB_REF_NAME || '';
const rules = read('src/rules.js');
const ruleMatch = /version:\s*'([^']+)'/.exec(rules);
const expectedFiles = [
  ['package.json', packageInfo.version],
  ['src/rules.js', ruleMatch && ruleMatch[1]],
  ['INSTALL.txt', /Version\s+([^\s]+)/.exec(read('INSTALL.txt'))?.[1]],
  ['README.md', /\*\*v([^*]+)\.\*\*/.exec(read('README.md'))?.[1]],
  ['AI_REVIEW_BRIEF.md', /# Lantern ([^ ]+) Independent Review Brief/.exec(read('AI_REVIEW_BRIEF.md'))?.[1]]
];

if (!/^\d{1,3}(?:\.\d{1,3}){2}$/.test(version || '')) fail('manifest.json needs an X.Y.Z version');
expectedFiles.forEach(([file, found]) => {
  if (found !== version) fail(file + ' says ' + (found || '(missing)') + ', expected ' + version);
});

if (tag) {
  if (!/^v\d{1,3}(?:\.\d{1,3}){2}$/.test(tag)) fail('tag must be vX.Y.Z, got ' + tag);
  if (tag.slice(1) !== version) fail('tag ' + tag + ' does not match version ' + version);
}

if (!process.exitCode) {
  process.stdout.write('Release metadata is consistent for ' + version + (tag ? ' (' + tag + ')' : '') + '.\n');
}

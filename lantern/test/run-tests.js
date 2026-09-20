const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const tests = fs.readdirSync(__dirname)
  .filter(file => file.endsWith('.test.js'))
  .sort()
  .map(file => path.join(__dirname, file));
const result = childProcess.spawnSync(process.execPath, ['--test'].concat(tests), { stdio: 'inherit' });

if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const directories = ['src', 'popup'];
const files = directories.flatMap(directory => fs.readdirSync(path.join(root, directory))
  .filter(file => file.endsWith('.js'))
  .map(file => path.join(root, directory, file)));

let failed = false;
files.forEach(file => {
  const result = childProcess.spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
});

if (failed) process.exitCode = 1;
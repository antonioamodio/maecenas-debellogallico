// scripts/obfuscate-out.js
const obfuscator = require('javascript-obfuscator');
const fs = require('fs-extra');
const glob = require('glob');
const path = require('path');

const dir = path.resolve(__dirname, '..', 'out', '_next');
console.log('Obfuscating JS in:', dir);

const files = glob.sync(path.join(dir, '**/*.js'));
files.forEach(file => {
  console.log('Obfuscating', file);
  const code = fs.readFileSync(file, 'utf8');
  const obf = obfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: true,
    stringArray: true,
    rotateStringArray: true,
    stringArrayThreshold: 0.75
  }).getObfuscatedCode();
  fs.writeFileSync(file, obf, 'utf8');
});
console.log('Done obfuscating', files.length, 'files.');

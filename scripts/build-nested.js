#!/usr/bin/env node
// 由 orca_zh_TW_translation.json（扁平點分鍵）產生 zh-TW-nested.js（Orca 前端實際讀取的巢狀檔）
// 用法： node scripts/build-nested.js [來源.json] [輸出.js]
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || path.join(__dirname, '..', 'orca_zh_TW_translation.json');
const OUT = process.argv[3] || path.join(__dirname, '..', 'zh-TW-nested.js');

const raw = fs.readFileSync(SRC, 'utf8');
const flat = JSON.parse(raw);

const nested = {};
for (const [key, val] of Object.entries(flat)) {
  const parts = key.split('.');
  let node = nested;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof node[p] !== 'object' || node[p] === null) node[p] = {};
    node = node[p];
  }
  node[parts[parts.length - 1]] = val;
}

const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const body = JSON.stringify(nested, null, 2).replace(/\n/g, EOL);
fs.writeFileSync(OUT, `export default ${body};${EOL}`, 'utf8');

const n = Object.keys(flat).length;
console.log(`✅ ${path.basename(OUT)} 已產生（${n} 條字串）`);

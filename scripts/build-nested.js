#!/usr/bin/env node
// 由 orca_zh_TW_translation.json（扁平點分鍵）產生兩種字典格式：
//   zh-TW-nested.js      ESM（export default）→ out/renderer/assets/
//   zh-TW-nested.cjs.js  CJS（exports.default）→ out/main/chunks/
// main process 用 require() 讀 mod.default，與 renderer 的 ESM 不同，故需兩份。
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

// CJS 變體：比對官方 out/main/chunks/zh-*.js 的格式（exports.default + 具名匯出）
const CJS_OUT = OUT.replace(/\.js$/, '.cjs.js');
const named = Object.keys(nested).map(k => `exports.${k} = zhTW.${k};`).join(EOL);
fs.writeFileSync(CJS_OUT,
  `"use strict";${EOL}` +
  `Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });${EOL}` +
  `const zhTW = ${body};${EOL}` +
  `exports.default = zhTW;${EOL}` +
  `${named}${EOL}`,
  'utf8');

// 產生後立刻用真正的 JS parser 驗一次。字典是 lazy chunk，語法有問題時
// Orca 只會拋「Unexpected token」並讓面板的 error boundary 接住，很難追。
// 在這裡擋掉，比事後 verify 更早。
{
  const { execFileSync } = require('child_process');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-zh-tw-build-'));
  for (const [src, name] of [[OUT, 'dict.mjs'], [CJS_OUT, 'dict.cjs']]) {
    const probe = path.join(tmp, name);
    fs.copyFileSync(src, probe);
    try {
      execFileSync(process.execPath, ['--check', probe], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      console.error(`❌ ${path.basename(src)} 語法無效，已中止：`);
      console.error('   ' + String(e.stderr || e.message).split('\n').slice(0, 3).join('\n   '));
      process.exit(1);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

const n = Object.keys(flat).length;
console.log(`✅ ${path.basename(OUT)}（ESM／renderer）已產生（${n} 條字串，語法驗證通過）`);
console.log(`✅ ${path.basename(CJS_OUT)}（CJS／main process）已產生`);

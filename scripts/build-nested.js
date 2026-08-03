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

// 防呆：同一個 key 若既是葉節點字串、又是別的 key 的前綴（例如同時存在
// "a.b" 與 "a.b.c"），轉巢狀時 "a.b" 會先被寫成字串，處理到 "a.b.c" 時
// 發現 "a.b" 不是物件就直接覆蓋成 {}，字串值會被silently吃掉——
// 扁平 key 數與最終葉節點數就會對不上，且不會有任何錯誤訊息。
// 這正是 dashboardPopout.settings 曾經被 dashboardPopout.settings.showIdle
// 悄悄蓋掉的原因，所以在這裡先擋，而不是事後靠算術對不上才發現。
{
  // 排序後，k 的所有子鍵（k. 開頭）必定緊接在 k 後面（"." 的 code point
  // 比任何英數字都小），所以只要比對相鄰兩個字串就能抓到衝突，
  // 不必兩兩比對全部 key（11000+ 條字串跑 O(n²) 會很有感）。
  const sorted = Object.keys(flat).sort();
  const collisions = sorted.filter((k, i) => i + 1 < sorted.length && sorted[i + 1].startsWith(k + '.'));
  if (collisions.length) {
    console.error('❌ 字典鍵衝突：以下 key 同時是字串又是別的 key 的前綴，轉巢狀時字串值會被吃掉：');
    collisions.forEach(k => console.error(`   ${k} = ${JSON.stringify(flat[k])}`));
    console.error('   請移除該扁平字串 key，或把它改名（例如 X → X.label），避免跟子鍵撞名。');
    process.exit(1);
  }
}

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

// scripts/ 底下的腳本也檢查控制字元。
// 我兩次用 regex 修補腳本時寫進了不可見字元：一次是 U+2028 直接寫進正則字面值
// 把該檔案自己弄壞，一次是把分隔空格寫成 U+0000，害例外清單永遠比對不到
// 而完全無聲。node --check 不會抱怨 NUL 在字串裡，只有這種掃描抓得到。
{
  const dir = __dirname;
  const bad = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (let i = 0; i < src.length; i++) {
      const c = src.codePointAt(i);
      if ((c < 0x20 && c !== 0x0a && c !== 0x0d && c !== 0x09) || c === 0x2028 || c === 0x2029) {
        bad.push(`${f} 位移 ${i}：U+${c.toString(16).padStart(4, '0').toUpperCase()}`);
      }
    }
  }
  if (bad.length) {
    console.error('❌ 腳本含不可見控制字元，已中止：');
    bad.slice(0, 10).forEach(x => console.error('   ' + x));
    process.exit(1);
  }
}

const n = Object.keys(flat).length;
console.log(`✅ ${path.basename(OUT)}（ESM／renderer）已產生（${n} 條字串，語法驗證通過）`);
console.log(`✅ ${path.basename(CJS_OUT)}（CJS／main process）已產生`);

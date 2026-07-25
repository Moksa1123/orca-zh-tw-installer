#!/usr/bin/env node
// Tier 0b：在中日韓文字與半形英數之間補上半形空格（風格指南規則 4）
// 用法： node scripts/sweep-spacing.js [--write]
const fs = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, '..', 'orca_zh_TW_translation.json');
const WRITE = process.argv.includes('--write');

const CJK = '一-鿿㐀-䶿';
const AN = 'A-Za-z0-9';
// 只處理「漢字↔半形英數」邊界。全形標點（「」，。）不在 CJK 範圍內，天然不受影響。
const RE_AFTER = new RegExp(`([${CJK}])([${AN}])`, 'g');
const RE_BEFORE = new RegExp(`([${AN}])([${CJK}])`, 'g');

function fix(s) {
  // 跑兩次：處理「中A中」這種左右都要補的情形
  return s.replace(RE_AFTER, '$1 $2').replace(RE_BEFORE, '$1 $2')
          .replace(RE_AFTER, '$1 $2').replace(RE_BEFORE, '$1 $2');
}

const raw = fs.readFileSync(JSON_PATH, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const data = JSON.parse(raw);

let changed = 0, inserted = 0;
const digitCases = [], samples = [];

for (const [key, val] of Object.entries(data)) {
  if (typeof val !== 'string') continue;
  const out = fix(val);
  if (out === val) continue;
  changed++;
  inserted += out.length - val.length;
  if (/[0-9]/.test(val.match(new RegExp(`[${CJK}][0-9]|[0-9][${CJK}]`)) || '')) {
    digitCases.push({ before: val, after: out });
  }
  if (samples.length < 10) samples.push({ before: val, after: out });
  if (WRITE) data[key] = out;
}

console.log(`受影響字串：${changed} 句 / 補入空格 ${inserted} 個\n`);
console.log('樣本：');
for (const s of samples) {
  console.log('  - ' + s.before.slice(0, 62));
  console.log('  + ' + s.after.slice(0, 63));
}
console.log(`\n數字相鄰案例（需人工確認，共 ${digitCases.length} 句）：`);
for (const d of digitCases) {
  console.log('  - ' + d.before.slice(0, 62));
  console.log('  + ' + d.after.slice(0, 63));
}

if (WRITE) {
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2).replace(/\n/g, EOL), 'utf8');
  console.log('\n✅ 已寫入 orca_zh_TW_translation.json');
} else {
  console.log('\n（dry-run，未寫檔。加 --write 才會實際修改）');
}

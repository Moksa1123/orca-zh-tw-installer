#!/usr/bin/env node
// 把某個命名空間的中文譯文與 es/ja/ko 三個對照語言並列印出。
//
// Orca 沒有 en 語系檔（英文是內嵌 fallback），所以判斷原文語意只能靠對照語言。
// 逐句猜「這個中文是從哪個英文來的」很容易猜錯——我在批次 12 就因為看鄰近
// 字串推測而把「區域」誤改成「區塊」（西文 área 證明是錯的）。並列著看就沒有
// 這個問題。
//
// 日文特別有用：日文的漢字詞常與中文技術用語同源，一眼就能看出中文是否偏離
// （例：日文「担当者」對應中文應是「指派對象」而非「指派物件」）。
//
// 用法：
//   node scripts/extract-reference-locale.js es > /tmp/.ref-es.json   （ja、ko 同）
//   node scripts/show-multilang.js <命名空間前綴> [--dir <對照檔目錄>] [--diff-only]
//
//   --diff-only   只印三語有分歧的（三語一致的多半是識別碼，另有 audit-identifiers 處理）
const fs = require('fs');
const path = require('path');

const PREFIX = process.argv[2];
if (!PREFIX) {
  console.error('用法: node scripts/show-multilang.js <命名空間前綴> [--dir <目錄>] [--diff-only]');
  process.exit(1);
}
const di = process.argv.indexOf('--dir');
const DIR = di > -1 ? process.argv[di + 1] : process.env.TMPDIR || require('os').tmpdir();
const DIFF_ONLY = process.argv.includes('--diff-only');

const L = {};
for (const l of ['es', 'ja', 'ko']) {
  const f = path.join(DIR, `.ref-${l}.json`);
  if (!fs.existsSync(f)) {
    console.error(`❌ 找不到 ${f}`);
    console.error(`   先跑： node scripts/extract-reference-locale.js ${l} > "${f}"`);
    process.exit(1);
  }
  L[l] = JSON.parse(fs.readFileSync(f, 'utf8'));
}
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'orca_zh_TW_translation.json'), 'utf8'));

const keys = Object.keys(zh).filter(k => k.includes(PREFIX) && typeof zh[k] === 'string');
if (!keys.length) { console.error(`找不到符合 ${PREFIX} 的鍵`); process.exit(1); }

// 中文寬度以 2 計，才能對齊
const w = s => [...s].reduce((n, c) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(c) ? 2 : 1), 0);
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - w(s)));

let shown = 0, missing = 0;
for (const k of keys) {
  const es = L.es[k], ja = L.ja[k], ko = L.ko[k];
  if (es === undefined) { missing++; continue; }
  if (DIFF_ONLY && es === ja && ja === ko) continue;
  const tail = k.replace(/^auto\./, '').split('.').slice(-1)[0];
  console.log(`${pad(zh[k].slice(0, 30), 32)}│ ${pad(String(es).slice(0, 34), 36)}│ ${pad(String(ja).slice(0, 26), 28)}│ ${String(ko).slice(0, 24)}   ${tail}`);
  shown++;
}
console.log(`\n${PREFIX}：共 ${keys.length} 句，印出 ${shown}${missing ? `，對照語言缺 ${missing}` : ''}`);
console.log('欄位：中文 │ 西 │ 日 │ 韓');

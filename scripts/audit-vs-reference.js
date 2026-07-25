#!/usr/bin/env node
// 以另一語言的官方語系檔為對照，找出中文可能譯錯的字串。
//
// Orca 沒有 en 語系檔（英文是內嵌 fallback），但 es/ja/ko 的 key 與中文完全
// 相同。那些語言的翻譯品質明顯較好，可用來反推原意——特別是：
//
//   A. 西文保留英文原樣，中文卻翻譯了 → 識別碼/專名被誤譯
//      （ogg→奧格、UDID→烏迪德、Grep→格雷普 都是這類）
//   B. 長度比例異常 → 可能漏譯或加譯
//
// 用法：
//   node scripts/extract-reference-locale.js es > ref-es.json
//   node scripts/audit-vs-reference.js ref-es.json [--all]
const fs = require('fs');
const path = require('path');

const REF = process.argv[2];
if (!REF) { console.error('用法: node scripts/audit-vs-reference.js <ref-es.json> [--all]'); process.exit(1); }
const SHOW_ALL = process.argv.includes('--all');

const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'orca_zh_TW_translation.json'), 'utf8'));

const common = Object.keys(ref).filter(k => typeof ref[k] === 'string' && typeof zh[k] === 'string');
console.log(`對照 ${REF}：${Object.keys(ref).length} 條，與中文對齊 ${common.length} 條\n`);

const hasCJK = s => /[一-鿿]/.test(s);
// 「純識別碼」：全為英數與少量符號，且不含空格分隔的多個單字（那通常是句子）
const isToken = s => /^[A-Za-z0-9][A-Za-z0-9._@#:/+-]*$/.test(s.trim());

// ── A. 西文保留原樣、中文卻譯了 ──
const A = [];
for (const k of common) {
  const r = ref[k].trim(), z = zh[k].trim();
  if (!isToken(r)) continue;          // 對照語言也翻譯了 → 本來就該翻
  if (!hasCJK(z)) continue;           // 中文也保留了 → 正確
  A.push({ k, r, z });
}
A.sort((a, b) => a.r.length - b.r.length);
console.log(`⚠ 對照語言保留原樣、中文卻翻譯了：${A.length} 處`);
console.log('  （這類多半是識別碼、副檔名、格式名、專有名詞）');
for (const x of (SHOW_ALL ? A : A.slice(0, 40))) {
  console.log(`   ${JSON.stringify(x.z).padEnd(20)} ← ${JSON.stringify(x.r).padEnd(18)} ${x.k.replace(/^auto\./, '')}`);
}
if (!SHOW_ALL && A.length > 40) console.log(`   …另 ${A.length - 40} 處（加 --all）`);

// ── B. 長度比例異常 ──
// 中文通常比西文短（無空格、字元密度高）。比例落在合理帶外的值得看。
const B = [];
for (const k of common) {
  const r = ref[k].trim(), z = zh[k].trim();
  if (r.length < 12 || !hasCJK(z)) continue;
  const ratio = z.length / r.length;
  if (ratio > 1.0 || ratio < 0.22) B.push({ k, r, z, ratio });
}
B.sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));
console.log(`\n⚠ 長度比例異常（中文/西文 > 1.0 或 < 0.22）：${B.length} 處`);
for (const x of (SHOW_ALL ? B : B.slice(0, 15))) {
  console.log(`   比 ${x.ratio.toFixed(2)}  ${JSON.stringify(x.z.slice(0, 44))}`);
  console.log(`            ← ${JSON.stringify(x.r.slice(0, 52))}`);
}
if (!SHOW_ALL && B.length > 15) console.log(`   …另 ${B.length - 15} 處（加 --all）`);

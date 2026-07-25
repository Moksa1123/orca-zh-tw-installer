#!/usr/bin/env node
// 對某個命名空間做機械複查：抓出可自動偵測的問題。
// 用法： node scripts/audit-batch.js <命名空間前綴> [--all]
const fs = require('fs');
const path = require('path');

const PREFIX = process.argv[2];
if (!PREFIX) { console.error('用法: node scripts/audit-batch.js <命名空間前綴>'); process.exit(1); }
const SHOW_ALL = process.argv.includes('--all');

const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'orca_zh_TW_translation.json'), 'utf8'));
const E = Object.entries(j).filter(([k, v]) => typeof v === 'string' && k.includes(PREFIX));
console.log(`範圍 ${PREFIX}：${E.length} 句\n`);

const short = k => k.split('.').slice(-2).join('.');
const report = (title, rows, hint) => {
  if (!rows.length) { console.log(`✅ ${title}：無`); return; }
  console.log(`\n⚠ ${title}：${rows.length} 處${hint ? '  — ' + hint : ''}`);
  for (const r of (SHOW_ALL ? rows : rows.slice(0, 12))) console.log('   ' + r);
  if (!SHOW_ALL && rows.length > 12) console.log(`   …另 ${rows.length - 12} 處（加 --all 全列）`);
};

// 1. 完全未翻譯（無中日韓文字）
report('未翻譯',
  E.filter(([, v]) => v.trim() && !/[一-鿿]/.test(v)).map(([k, v]) => `${JSON.stringify(v)}  [${short(k)}]`),
  '可能是品牌名（正常）或漏翻');

// 2. 殘留半形標點：句末英文句號、半形括號夾中文
report('標點半形化',
  E.filter(([, v]) => /[一-鿿]\.$/.test(v) || /[一-鿿]\s*\([^)]*[一-鿿]/.test(v))
    .map(([k, v]) => `${JSON.stringify(v.slice(0, 50))}  [${short(k)}]`),
  '中文句末應用「。」；夾中文的括號應用全形');

// 3. 疑似截斷（以標點或連接詞結尾）
report('疑似截斷',
  E.filter(([, v]) => /[（(、，,：:／/]$/.test(v.trim()))
    .map(([k, v]) => `${JSON.stringify(v)}  [${short(k)}]`),
  'UI 串接片段屬正常，其餘需查');

// 4. 同一命名空間內出現重複譯文（可能是不同原文被譯成同一句）
const byNs = new Map();
for (const [k, v] of E) {
  const ns = k.split('.').slice(0, -1).join('.');
  if (!byNs.has(ns)) byNs.set(ns, new Map());
  const m = byNs.get(ns);
  if (!m.has(v)) m.set(v, []);
  m.get(v).push(k);
}
const dups = [];
for (const [ns, m] of byNs) for (const [v, ks] of m) {
  if (ks.length > 1 && v.length > 3) dups.push(`${JSON.stringify(v.slice(0, 40))} ×${ks.length}  [${ns.split('.').slice(-1)[0]}]`);
}
report('同命名空間內重複譯文', dups, '可能是不同原文被譯成同一句，需查原文');

// 5. 過長的疑似按鈕／標籤（無標點且超過 12 字）
report('疑似過長的標籤',
  E.filter(([, v]) => v.length > 12 && v.length < 30 && !/[。，、；：？！\s]/.test(v))
    .map(([k, v]) => `${v}（${v.length} 字）  [${short(k)}]`),
  '按鈕/分頁標籤過長會被截斷');

// 6. 中文與全形標點之間多餘空格
report('全形標點旁多餘空格',
  E.filter(([, v]) => /\s[，。、；：！？」）]|[「（]\s/.test(v))
    .map(([k, v]) => `${JSON.stringify(v.slice(0, 50))}  [${short(k)}]`));

// 7. 同時出現「你」與「您」
report('人稱混用',
  E.filter(([, v]) => /你/.test(v) && /您/.test(v)).map(([k, v]) => `${JSON.stringify(v.slice(0, 50))}  [${short(k)}]`));

// 8. 全形英數字（應為半形）
report('全形英數字',
  E.filter(([, v]) => /[Ａ-Ｚａ-ｚ０-９]/.test(v)).map(([k, v]) => `${JSON.stringify(v.slice(0, 50))}  [${short(k)}]`));

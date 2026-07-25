#!/usr/bin/env node
// key 尾端的 10 位十六進位是「英文原文的雜湊」——同 hash 即同一句英文。
// 若同 hash 的譯文不同，就是同一原文被譯成不同結果，必須統一。
// 用法： node scripts/audit-hash-conflicts.js [--all]
const fs = require('fs');
const path = require('path');

const SHOW_ALL = process.argv.includes('--all');
const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'orca_zh_TW_translation.json'), 'utf8'));

// 排除人工編的假 hash。這類 key（1a2b3c4d5e、2b3c4d5e6f…）被不同元件各自
// 重用，並不代表同一句英文，會製造大量假衝突。特徵是相鄰字元對呈規律遞增。
function looksHandWritten(h) {
  const pairs = h.match(/.{2}/g);            // 5 組兩字元
  let asc = 0;
  for (let i = 1; i < pairs.length; i++) {
    if (parseInt(pairs[i], 16) > parseInt(pairs[i - 1], 16)) asc++;
  }
  if (asc === pairs.length - 1) return true;             // 全遞增
  return /^(?:([0-9a-f])\1|0123|1234|abcd|dead|beef)/.test(h);
}

const byHash = new Map();
let skipped = 0;
for (const [k, v] of Object.entries(j)) {
  if (typeof v !== 'string') continue;
  const m = k.match(/\.([0-9a-f]{10})$/);   // 只認 10 位十六進位結尾
  if (!m) continue;
  const h = m[1];
  if (looksHandWritten(h)) { skipped++; continue; }
  if (!byHash.has(h)) byHash.set(h, []);
  byHash.get(h).push([k, v]);
}

const conflicts = [];
for (const [h, rows] of byHash) {
  if (rows.length < 2) continue;
  const uniq = [...new Set(rows.map(([, v]) => v))];
  if (uniq.length < 2) continue;
  conflicts.push({ h, rows, uniq });
}

// 注意：hash 並非純內容雜湊——「Pull Request 已重新開啟」與「Issue 已重新開啟」
// 同 hash 但英文不同。所以同 hash 不等於同原文，會有假陽性。
//
// 真正有價值的訊號是「譯文高度相似」：那幾乎確定是同一句英文被譯了兩次，
// 只差用詞（保持最新 vs 保持最新狀態）。故按相似度由高到低排序。
function similarity(a, b) {
  const short = a.length < b.length ? a : b;
  const long = a.length < b.length ? b : a;
  if (!long.length) return 1;
  let common = 0;
  const pool = [...long];
  for (const ch of short) {
    const i = pool.indexOf(ch);
    if (i >= 0) { common++; pool.splice(i, 1); }
  }
  return common / long.length;
}
const maxSim = c => {
  let best = 0;
  for (let i = 0; i < c.uniq.length; i++)
    for (let k = i + 1; k < c.uniq.length; k++)
      best = Math.max(best, similarity(c.uniq[i], c.uniq[k]));
  return best;
};
for (const c of conflicts) c.sim = maxSim(c);
conflicts.sort((a, b) => b.sim - a.sim);

console.log(`共 ${byHash.size} 個 hash，其中 ${conflicts.length} 個有譯文衝突\n`);
for (const c of (SHOW_ALL ? conflicts : conflicts.slice(0, 30))) {
  console.log(`── ${c.h} （${c.uniq.length} 種譯法，相似度 ${(c.sim*100).toFixed(0)}%）`);
  for (const [k, v] of c.rows) {
    console.log(`   ${JSON.stringify(v.slice(0, 56))}`);
    console.log(`       ${k.replace(/\.[0-9a-f]{10}$/, '')}`);
  }
}
if (!SHOW_ALL && conflicts.length > 30) console.log(`\n…另 ${conflicts.length - 30} 個（加 --all 全列）`);

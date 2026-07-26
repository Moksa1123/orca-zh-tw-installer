#!/usr/bin/env node
// 把「純句式差異」的組別依多數決統一。
//
// 只處理各版本去掉虛詞與標點後完全相同的組別——那些語意一定一致，
// 差別只在「和」vs「與」、「的」有無、全形半形括號這類。
//
// 三道保護：
//   1. 只動 audit-consistency-classify 判定為純句式的組
//   2. 多數決平手就跳過（沒有客觀理由選哪個）
//   3. 事後檢查疊字
//
// 用法： node scripts/unify-phrasing.js [--write]
const fs = require('fs');
const path = require('path');

const WRITE = process.argv.includes('--write');
const ROOT = path.join(__dirname, '..');
const P = path.join(ROOT, 'orca_zh_TW_translation.json');

const es = JSON.parse(fs.readFileSync(path.join(ROOT, '.ref-es.json'), 'utf8'));
const raw = fs.readFileSync(P, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const j = JSON.parse(raw);

const norm = s => s
  .replace(/[的和與了個請一地中上到在為將把]/g, '')
  .replace(/[（）()「」【】\[\]，,。.、：:；;！!？?—\-–…\s]/g, '')
  .toLowerCase();

const groups = new Map();
for (const [k, v] of Object.entries(j)) {
  if (typeof v !== 'string' || typeof es[k] !== 'string' || !es[k].trim()) continue;
  if (!groups.has(es[k])) groups.set(es[k], []);
  groups.get(es[k]).push(k);
}

let unified = 0, changed = 0, tied = 0;
const log = [];
for (const [e, keys] of groups) {
  const counts = new Map();
  for (const k of keys) counts.set(j[k], (counts.get(j[k]) || 0) + 1);
  if (counts.size < 2) continue;
  if (new Set([...counts.keys()].map(norm)).size !== 1) continue;   // 非純句式，不碰

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] === sorted[1][1]) {
    // 次數平手時改用全檔慣例裁決。這些比例是從現有譯文統計出來的，
    // 不是我的偏好：與 150:和 83、全形括號 118:半形 20。
    const top = sorted.filter(s => s[1] === sorted[0][1]).map(s => s[0]);
    // 純大小寫差異不裁決。原文若是小寫（搜尋關鍵字多半如此），照原文會把
    // macOS 改成 macos、OpenAI 改成 openai——那是把品牌名改差。
    // 搜尋不分大小寫，維持現狀比兩邊都改動好。
    if (new Set(top.map(s => s.toLowerCase())).size === 1) { tied++; continue; }
    const score = s => {
      let n = 0;
      n += (s.match(/與/g) || []).length - (s.match(/和/g) || []).length;   // 連接詞用「與」
      n += (s.match(/（/g) || []).length - (s.match(/ \(/g) || []).length;  // 括號用全形
      // ASCII 詞照原文大小寫（iOS 不是 ios、PR 不是 pr）
      for (const m of String(e).matchAll(/[A-Za-z][A-Za-z0-9.]*/g)) if (s.includes(m[0])) n += 0.5;
      return n;
    };
    const ranked = top.map(s => [s, score(s)]).sort((a, b) => b[1] - a[1]);
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) { tied++; continue; }  // 慣例也分不出，跳過
    sorted.length = 0;
    sorted.push([ranked[0][0], 1], ...ranked.slice(1).map(r => [r[0], 1]));
  }

  const win = sorted[0][0];
  log.push(`  「${e.slice(0, 40)}」→ ${win.slice(0, 40)}`);
  for (const [v, c] of sorted.slice(1)) log.push(`      捨棄 ${v.slice(0, 40)}${c > 1 ? ` ×${c}` : ''}`);
  for (const k of keys) if (j[k] !== win) { j[k] = win; changed++; }
  unified++;
}

const bad = [];
for (const v of Object.values(j)) {
  if (typeof v !== 'string') continue;
  for (const m of v.matchAll(/([㐀-鿿]{2,4})\1/g)) bad.push(`疊字 ${m[0]}：${v.slice(0, 46)}`);
}

log.forEach(x => console.log(x));
console.log(`\n統一 ${unified} 組、${changed} 句；平手跳過 ${tied} 組`);
if (bad.length) {
  console.log('\n❌ 事後檢查未過，不寫檔：');
  bad.slice(0, 15).forEach(x => console.log('   ' + x));
  process.exit(1);
}
if (WRITE) {
  fs.writeFileSync(P, JSON.stringify(j, null, 2).replace(/\n/g, EOL), 'utf8');
  console.log('✅ 已寫入');
} else {
  console.log('（dry-run，加 --write 才會修改）');
}

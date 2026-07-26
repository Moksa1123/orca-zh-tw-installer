#!/usr/bin/env node
// 把 audit-consistency 找到的「同一原文多種譯法」分成兩類：
//
//   純句式  — 各版本去掉虛詞與標點後完全相同（「和」vs「與」、「的」有無、
//             全形半形括號）。語意一致，可依多數決統一。
//   需判讀  — 去虛詞後仍不同，可能有語意差異，必須逐組人工看。
//
// 這個切分是為了不要把 300 多組全部當成人工工作——真正需要判斷的通常只佔少數。
//
// 用法： node scripts/audit-consistency-classify.js [--phrase|--semantic] [--all]
const fs = require('fs');
const path = require('path');

const MODE = process.argv.includes('--semantic') ? 'semantic'
           : process.argv.includes('--phrase') ? 'phrase' : 'both';
const SHOW_ALL = process.argv.includes('--all');

const es = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.ref-es.json'), 'utf8'));
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'orca_zh_TW_translation.json'), 'utf8'));

const groups = new Map();
for (const [k, v] of Object.entries(zh)) {
  if (typeof v !== 'string' || typeof es[k] !== 'string' || !es[k].trim()) continue;
  if (!groups.has(es[k])) groups.set(es[k], new Map());
  const m = groups.get(es[k]);
  m.set(v, (m.get(v) || 0) + 1);
}

// 虛詞與標點差異不改變語意
const norm = s => s
  .replace(/[的和與了個請一地中上到在為將把]/g, '')
  .replace(/[（）()「」【】\[\]，,。.、：:；;！!？?—\-–…\s]/g, '')
  .toLowerCase();

const phrase = [], semantic = [];
for (const [e, m] of groups) {
  if (m.size < 2) continue;
  const variants = [...m.entries()].sort((a, b) => b[1] - a[1]);
  const normed = new Set(variants.map(v => norm(v[0])));
  (normed.size === 1 ? phrase : semantic).push({ e, variants });
}

const dump = (title, list) => {
  console.log(`\n${title}：${list.length} 組`);
  for (const g of (SHOW_ALL ? list : list.slice(0, 30))) {
    console.log(`  西「${g.e.slice(0, 44)}」`);
    for (const [v, c] of g.variants) console.log(`      ${v.slice(0, 48)}${c > 1 ? `  ×${c}` : ''}`);
  }
  if (!SHOW_ALL && list.length > 30) console.log(`   …另 ${list.length - 30} 組（加 --all）`);
};

console.log(`對齊 ${groups.size} 句原文，譯法不一致 ${phrase.length + semantic.length} 組`);
if (MODE !== 'semantic') dump('純句式（去虛詞後相同，可依多數決統一）', phrase);
if (MODE !== 'phrase') dump('需判讀（可能有語意差異）', semantic);

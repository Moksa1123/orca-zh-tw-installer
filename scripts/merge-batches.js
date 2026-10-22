#!/usr/bin/env node
// 把分批翻譯的結果併回字典，併入前先檢查。
//
// 用法：node scripts/merge-batches.js <工作目錄> [--write]
//   <工作目錄>/todo.json              audit-missing.js 產生的待翻清單（含英文原文）
//   <工作目錄>/batches/*.out.json      各批譯文 { key: 譯文 }
// 不加 --write 只檢查不寫檔。任何一項檢查沒過都不會寫入。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = process.argv[2];
const WRITE = process.argv.includes('--write');
if (!DIR) { console.error('用法：node scripts/merge-batches.js <工作目錄> [--write]'); process.exit(2); }

const todo = JSON.parse(fs.readFileSync(path.join(DIR, 'todo.json'), 'utf8'));
const merged = {};
const outs = fs.readdirSync(path.join(DIR, 'batches')).filter(f => f.endsWith('.out.json')).sort();
for (const f of outs) Object.assign(merged, JSON.parse(fs.readFileSync(path.join(DIR, 'batches', f), 'utf8')));

const problems = [];
const missing = Object.keys(todo).filter(k => !(k in merged));
const extra = Object.keys(merged).filter(k => !(k in todo));
if (missing.length) problems.push(`漏譯 ${missing.length} 句：${missing.slice(0, 5).join(', ')}`);
if (extra.length) problems.push(`多出 ${extra.length} 句：${extra.slice(0, 5).join(', ')}`);

const phs = s => (s.match(/\{\{\s*[\w.]+\s*\}\}/g) || []).map(x => x.replace(/\s/g, '')).sort();
for (const [k, v] of Object.entries(merged)) {
  if (typeof v !== 'string' || !v.trim()) { problems.push(`空白譯文：${k}`); continue; }
  const s = todo[k]; if (!s) continue;
  const ref = s.en ?? s.es ?? s.ja ?? s.ko ?? s.fr;
  if (!ref) continue;
  const a = phs(ref), b = phs(v);
  // 譯文可以少掉佔位符（英文複數字尾 s 會刻意拿掉），但不可以多出或改名
  if (!b.every(x => a.includes(x)) || (a.length - b.length > 1)) problems.push(`佔位符不符：${k}  原文 ${a.join(' ')}｜譯文 ${b.join(' ')}`);
  // 原文本身就有的 ...（例如 git diff main...HEAD）是程式碼，不是刪節號
  const dots = x => (x.match(/\.\.\./g) || []).length;
  if (dots(v) > dots(ref)) problems.push(`刪節號請用 …：${k}`);
  if (v.includes('您')) problems.push(`用了「您」：${k}`);
}

console.log(`${outs.length} 批、${Object.keys(merged).length} 句（待翻 ${Object.keys(todo).length}）`);
if (problems.length) {
  console.log(`❌ ${problems.length} 個問題：`);
  problems.slice(0, 20).forEach(p => console.log('   ' + p));
  process.exit(1);
}
console.log('✅ 完整、佔位符相符、無「...」與「您」');

if (!WRITE) { console.log('（未寫入。加 --write 併入字典）'); process.exit(0); }
const F = path.join(ROOT, 'orca_zh_TW_translation.json');
const cur = JSON.parse(fs.readFileSync(F, 'utf8'));
let n = 0;
for (const [k, v] of Object.entries(merged)) if (!(k in cur)) { cur[k] = v; n++; }
const out = {};
for (const k of Object.keys(cur).sort()) out[k] = cur[k];
fs.writeFileSync(F, JSON.stringify(out, null, 2) + '\n');
console.log(`✅ 併入 ${n} 句，字典共 ${Object.keys(out).length} 句`);

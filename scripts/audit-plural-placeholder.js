#!/usr/bin/env node
// 找出「英文複數字尾佔位符」被中文原樣保留的字串。
//
// 英文用 `{{count}} label{{s}}` 這種寫法處理單複數，第二個佔位符只會展開成
// "s" 或空字串。中文沒有複數變化，若照抄就會渲染成「3 個標籤 s」。
//
// 判準：對照語言（西文）中該佔位符緊接在一個完整單字（≥3 字母）之後且無空白。
// 要求 ≥3 字母是為了排除 `v{{value0}}`（版號）、`:L{{value0}}`（行號）、
// `H{{value0}}`（標題層級）這類前綴字母。
//
// 再要求中文裡該佔位符是獨立的（前後為空白或字串邊界），確認它確實是被當成
// 一個「詞」留著，而不是嵌在別的語境裡。
//
// 用法： node scripts/audit-plural-placeholder.js [--dir <對照檔目錄>] [--write]
const fs = require('fs');
const path = require('path');

const di = process.argv.indexOf('--dir');
const DIR = di > -1 ? process.argv[di + 1] : require('os').tmpdir();
const WRITE = process.argv.includes('--write');
const P = path.join(__dirname, '..', 'orca_zh_TW_translation.json');

const refPath = path.join(DIR, '.ref-es.json');
if (!fs.existsSync(refPath)) {
  console.error(`❌ 找不到 ${refPath}`);
  console.error(`   先跑： node scripts/extract-reference-locale.js es > "${refPath}"`);
  process.exit(1);
}
const es = JSON.parse(fs.readFileSync(refPath, 'utf8'));
const raw = fs.readFileSync(P, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const j = JSON.parse(raw);

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hits = [];

for (const [k, v] of Object.entries(j)) {
  if (typeof v !== 'string' || typeof es[k] !== 'string') continue;
  for (const m of es[k].matchAll(/([a-záéíóúñ]{3,})\{\{(value\d+)\}\}/gi)) {
    const ph = `{{${m[2]}}}`;
    if (!v.includes(ph)) continue;                       // 中文已移除 → 正確
    // 中文裡該佔位符必須自成一段（前後是空白、標點或邊界）
    if (!new RegExp(`(^|\\s)${esc(ph)}(\\s|$|[。，、．])`).test(v)) continue;
    hits.push({ k, v, es: es[k], word: m[1], ph });
  }
}

for (const h of hits) {
  console.log(`  ${h.v.slice(0, 40).padEnd(42)}│ ${h.es.slice(0, 38).padEnd(40)}  ←「${h.word}」的複數字尾  ${h.k.split('.').slice(-2).join('.')}`);
}
console.log(`\n複數字尾佔位符殘留：${hits.length} 處`);

if (!hits.length) process.exit(0);

if (WRITE) {
  for (const h of hits) {
    // 連同前導空白一起移除。佔位符在句中時，後面那個空格也會變成孤立空格
    // （「個檔案 {{value1}} 上傳」→「個檔案 上傳」），所以再收掉漢字之間的空格。
    j[h.k] = j[h.k]
      .replace(new RegExp(`\\s*${esc(h.ph)}`), '')
      .replace(/([㐀-鿿]) +([㐀-鿿])/g, '$1$2')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  fs.writeFileSync(P, JSON.stringify(j, null, 2).replace(/\n/g, EOL), 'utf8');
  console.log(`✅ 已移除 ${hits.length} 處並寫入`);
} else {
  console.log('（dry-run，加 --write 才會實際修改）');
}

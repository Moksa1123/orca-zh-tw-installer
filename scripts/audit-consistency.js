#!/usr/bin/env node
// 用對照語言分組，找出「同一句原文被譯成不同中文」的地方。
//
// audit-batch.js 的「同命名空間重複譯文」是反過來看（不同原文 → 同一譯文），
// 那個方向大多是誤報（單複數在中文同形）。這個方向才是真問題：同一個英文
// 字串在 UI 各處應該永遠長一樣，不一致會讓人以為是兩個不同功能。
//
// 特別容易發生在「同一套 UI 複製多份」的地方——Orca 的 Claude／Codex／
// OpenCode 三個使用量面板就是這樣，譯法各自漂移。
//
// 大小寫必須敏感：`Claude` 與 `claude` 在原文就是兩個不同字串（一個是標籤、
// 一個是識別碼），轉小寫分組會把它們併在一起而產生假的不一致。
//
// 用法： node scripts/audit-consistency.js [命名空間前綴] [--dir <對照檔目錄>] [--all]
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const PREFIX = args[0] || '';
const di = process.argv.indexOf('--dir');
const DIR = di > -1 ? process.argv[di + 1] : '.';
const SHOW_ALL = process.argv.includes('--all');

const refPath = path.join(DIR, '.ref-es.json');
if (!fs.existsSync(refPath)) {
  console.error(`❌ 找不到 ${refPath}`);
  console.error('   先跑： npm run ref:all');
  process.exit(1);
}
const es = JSON.parse(fs.readFileSync(refPath, 'utf8'));
// 西文常把兩個英文詞合併（Inicio＝Start/Home），只看西文會把正確譯法報成不一致。
// 日文分得較細，要求兩者都相同才算同一句原文。詳見 audit-consistency-classify.js。
const ja = JSON.parse(fs.readFileSync(path.join(DIR, '.ref-ja.json'), 'utf8'));
const ko = JSON.parse(fs.readFileSync(path.join(DIR, '.ref-ko.json'), 'utf8'));
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'orca_zh_TW_translation.json'), 'utf8'));

const groups = new Map();
for (const [k, v] of Object.entries(zh)) {
  if (typeof v !== 'string' || typeof es[k] !== 'string') continue;
  if (PREFIX && !k.includes(PREFIX)) continue;
  if (!es[k].trim()) continue;
  const sig = `${es[k]} ${ja[k] ?? ''} ${ko[k] ?? ''}`;
  if (!groups.has(sig)) groups.set(sig, new Map());
  const m = groups.get(sig);
  m.set(v, (m.get(v) || 0) + 1);
}

const bad = [...groups.entries()].filter(([, m]) => m.size > 1);
// 譯法差異越大的排前面：長度差距是個粗略但有效的指標
bad.sort((a, b) => {
  const spread = m => { const l = [...m.keys()].map(s => s.length); return Math.max(...l) - Math.min(...l); };
  return spread(b[1]) - spread(a[1]);
});

console.log(`${PREFIX || '全檔'}：對齊 ${groups.size} 句原文，其中譯法不一致 ${bad.length} 組\n`);
for (const [e, m] of (SHOW_ALL ? bad : bad.slice(0, 40))) {
  console.log(`  西「${e.slice(0, 46)}」`);
  for (const [v, c] of m) console.log(`      → ${v.slice(0, 46)}${c > 1 ? ` ×${c}` : ''}`);
}
if (!SHOW_ALL && bad.length > 40) console.log(`\n   …另 ${bad.length - 40} 組（加 --all）`);

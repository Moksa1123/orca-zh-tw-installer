#!/usr/bin/env node
// Tier 0a：依 lock.csv 的 tier A 規則做確定性術語替換
// 用法： node scripts/sweep-terms.js [--write]
const fs = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, '..', 'orca_zh_TW_translation.json');
const LOCK_PATH = process.env.LOCK_CSV ||
  path.join(process.env.USERPROFILE || process.env.HOME, '.claude/skills/tw-translate/data/domains/lock.csv');
const WRITE = process.argv.includes('--write');

// 特例：需要負向前瞻，避免把已正確的詞再改一次
const LOOKAHEAD = { '終端': '(?!機)', '應用': '(?!程式)' };

function loadRules() {
  const lines = fs.readFileSync(LOCK_PATH, 'utf8').split(/\r?\n/)
    .filter(l => l.trim() && !l.startsWith('#'));
  const hdr = lines.shift().split(',');
  const rules = [];
  const skipped = [];
  for (const line of lines) {
    const c = line.split(',');
    const r = {}; hdr.forEach((h, i) => r[h] = (c[i] || '').trim());
    if (r.tier !== 'A' || !r.forbidden) continue;
    for (const bad of r.forbidden.split('|').filter(Boolean)) {
      // 安全閘門：單字元一律不機械替換；目標含來源會無限自我匹配
      if ([...bad].length < 2) { skipped.push(`${bad} → ${r.zh_tw}（單字元）`); continue; }
      // 目標含來源會無限自我匹配，除非有負向前瞻把已正確的形式排除掉
      if (r.zh_tw.includes(bad) && !LOOKAHEAD[bad]) {
        skipped.push(`${bad} → ${r.zh_tw}（目標含來源）`); continue;
      }
      rules.push({ en: r.en, bad, good: r.zh_tw });
    }
  }
  // 長詞優先，避免「配置文件」被「配置」搶先切走
  rules.sort((a, b) => b.bad.length - a.bad.length);
  return { rules, skipped };
}

const { rules, skipped } = loadRules();
const raw = fs.readFileSync(JSON_PATH, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';   // 保留原始換行，避免整檔重排的假 diff
const data = JSON.parse(raw);

const stats = new Map();
const samples = new Map();
let changedKeys = 0;

for (const [key, val] of Object.entries(data)) {
  if (typeof val !== 'string') continue;
  let out = val;
  for (const r of rules) {
    const re = new RegExp(r.bad + (LOOKAHEAD[r.bad] || ''), 'g');
    const n = (out.match(re) || []).length;
    if (!n) continue;
    stats.set(r.bad, (stats.get(r.bad) || 0) + n);
    if (!samples.has(r.bad)) samples.set(r.bad, { key, before: val });
    out = out.replace(re, r.good);
  }
  if (out !== val) { changedKeys++; if (WRITE) data[key] = out; }
}

console.log(`規則 ${rules.length} 條（安全閘門擋下 ${skipped.length} 條）`);
if (skipped.length) console.log('  擋下：' + skipped.join('、'));
console.log(`\n受影響字串：${changedKeys} 句 / 共 ${[...stats.values()].reduce((a, b) => a + b, 0)} 處\n`);

const rows = [...stats.entries()].sort((a, b) => b[1] - a[1]);
for (const [bad, n] of rows) {
  const r = rules.find(x => x.bad === bad);
  const s = samples.get(bad);
  const re = new RegExp(bad + (LOOKAHEAD[bad] || ''), 'g');
  console.log(`${String(n).padStart(4)}  ${bad} → ${r.good}   [${r.en}]`);
  console.log(`        - ${s.before.slice(0, 62)}`);
  console.log(`        + ${s.before.replace(re, r.good).slice(0, 62)}`);
}

if (WRITE) {
  const out = JSON.stringify(data, null, 2).replace(/\n/g, EOL);
  fs.writeFileSync(JSON_PATH, out, 'utf8');
  console.log('\n✅ 已寫入 orca_zh_TW_translation.json');
} else {
  console.log('\n（dry-run，未寫檔。加 --write 才會實際修改）');
}

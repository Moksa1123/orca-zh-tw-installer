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
      // re: 前綴 = 自訂正則。用於損壞修復與需要前後文條件的規則
      // （例如 (?<!來)源分支），作者自行負責正確性，不套用下列閘門。
      if (bad.startsWith('re:')) {
        rules.push({ en: r.en, bad, good: r.zh_tw, re: new RegExp(bad.slice(3), 'g') });
        continue;
      }
      // 安全閘門一：單字元擴寫成多字元最危險（包→套件 會打壞「包含」，
      // 庫→程式庫 會打壞「資料庫」）。等長的單字元替換（您→你）則安全。
      if ([...bad].length < 2 && [...r.zh_tw].length > 1) {
        skipped.push(`${bad} → ${r.zh_tw}（單字元擴寫）`); continue;
      }
      // 目標含來源會無限自我匹配，除非有負向前瞻把已正確的形式排除掉
      if (r.zh_tw.includes(bad) && !LOOKAHEAD[bad]) {
        skipped.push(`${bad} → ${r.zh_tw}（目標含來源）`); continue;
      }
      rules.push({ en: r.en, bad, good: r.zh_tw });
    }
  }
  // 損壞修復（re:）優先跑，再依長詞優先，避免「配置文件」被「配置」搶先切走
  rules.sort((a, b) => (b.re ? 1000 : b.bad.length) - (a.re ? 1000 : a.bad.length));
  return { rules, skipped };
}

const { rules, skipped } = loadRules();
const raw = fs.readFileSync(JSON_PATH, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';   // 保留原始換行，避免整檔重排的假 diff
const data = JSON.parse(raw);

const stats = new Map();
const samples = new Map();
let changedKeys = 0;

// 事後檢查用：統計「同一漢字連續重複」的出現次數。
// 替換有可能在詞界造出重複（許可權→權限 把「隱私權許可權」變成「隱私權權限」），
// 這種錯誤只看單條規則的 diff 看不出來，必須比對全檔前後。
const repeats = s => {
  const m = new Map();
  for (const x of s.matchAll(/([一-鿿])\1/g)) m.set(x[0], (m.get(x[0]) || 0) + 1);
  return m;
};
const before = repeats(Object.values(data).filter(v => typeof v === 'string').join('\n'));

for (const [key, val] of Object.entries(data)) {
  if (typeof val !== 'string') continue;
  let out = val;
  for (const r of rules) {
    const re = r.re || new RegExp(r.bad + (LOOKAHEAD[r.bad] || ''), 'g');
    re.lastIndex = 0;
    const n = (out.match(re) || []).length;
    if (!n) continue;
    stats.set(r.bad, (stats.get(r.bad) || 0) + n);
    if (!samples.has(r.bad)) samples.set(r.bad, { key, before: val });
    out = out.replace(re, r.good);
  }
  if (out !== val) { changedKeys++; data[key] = out; }
}

const after = repeats(Object.values(data).filter(v => typeof v === 'string').join('\n'));
const introduced = [];
for (const [ch, n] of after) {
  const was = before.get(ch) || 0;
  if (n > was) introduced.push(`${ch}（${was} → ${n}）`);
}

// 循環衝突偵測：有規則命中卻沒有任何字串改變，代表兩條規則互相抵銷
// （例：連線埠→連接埠 之後又被 連接→連線 改回去）
const totalHits = [...stats.values()].reduce((a, b) => a + b, 0);
const circular = totalHits > 0 && changedKeys === 0;

console.log(`規則 ${rules.length} 條（安全閘門擋下 ${skipped.length} 條）`);
if (skipped.length) console.log('  擋下：' + skipped.join('、'));
console.log(`\n受影響字串：${changedKeys} 句 / 共 ${[...stats.values()].reduce((a, b) => a + b, 0)} 處\n`);

const rows = [...stats.entries()].sort((a, b) => b[1] - a[1]);
for (const [bad, n] of rows) {
  const r = rules.find(x => x.bad === bad);
  const s = samples.get(bad);
  // regex 規則要用編譯好的 r.re，不能拿含 "re:" 前綴的原字串重建
  const re = r.re ? new RegExp(r.re.source, 'g') : new RegExp(bad + (LOOKAHEAD[bad] || ''), 'g');
  console.log(`${String(n).padStart(4)}  ${bad} → ${r.good}   [${r.en}]`);
  console.log(`        - ${s.before.slice(0, 62)}`);
  console.log(`        + ${s.before.replace(re, r.good).slice(0, 62)}`);
}

if (circular) {
  console.error('\n❌ 事後檢查：有規則命中卻沒有任何字串實際改變');
  console.error('   這代表兩條規則互相抵銷（A→B 之後又被 B→A 改回去）。');
  console.error('   例：連線埠→連接埠 被 連接→連線 改回去，需為後者加負向前瞻。');
  console.error('   請找出衝突的兩條規則後修正。未寫檔。');
  process.exit(1);
}
if (introduced.length) {
  console.error('\n❌ 事後檢查：替換在詞界造出了新的疊字，這通常代表規則寫錯了');
  for (const s of introduced) console.error('   ' + s);
  console.error('   （例：許可權→權限 會把「隱私權許可權」變成「隱私權權限」）');
  console.error('   請先修正 lock.csv 規則，或補一條損壞修復規則。未寫檔。');
  process.exit(1);
}
console.log('\n✅ 事後檢查：未造出新的疊字');

if (WRITE) {
  const out = JSON.stringify(data, null, 2).replace(/\n/g, EOL);
  fs.writeFileSync(JSON_PATH, out, 'utf8');
  console.log('✅ 已寫入 orca_zh_TW_translation.json');
} else {
  console.log('（dry-run，未寫檔。加 --write 才會實際修改）');
}

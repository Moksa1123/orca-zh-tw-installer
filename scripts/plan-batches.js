#!/usr/bin/env node
// 由現況資料產生 Tier 1~5 的分批清單（Markdown 表格）。
// 雙上限：400 句 / 6,000 字 —— 各模組句長差 14 倍，純用句數切會讓批次工作量差十倍。
//
// 用法：
//   node scripts/plan-batches.js            產生 Markdown 表格
//   node scripts/plan-batches.js --batch 7  印出第 7 批的實際 key 與譯文
const fs = require('fs');
const path = require('path');

const WANT = process.argv.includes('--batch')
  ? Number(process.argv[process.argv.indexOf('--batch') + 1])
  : null;
const MAX_NS_SHOWN = 6;

const MAX_KEYS = 400;
const MAX_CHARS = 6000;

const flat = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'orca_zh_TW_translation.json'), 'utf8'));

// 曝光度分層：越前面越常被使用者看到，越該先修
const TIERS = [
  { tier: 1, name: '高曝光介面', match: ['sidebar', 'rightSidebar', 'right', 'tab', 'status', 'editor', 'terminal', 'workspace', 'onboarding', 'orca', 'new', 'NewWorkspaceComposerCard'] },
  { tier: 2, name: '長文案（導覽／功能牆）', match: ['feature'] },
  { tier: 4, name: '外部整合', match: ['github', 'gitlab', 'linear', 'jira', 'GitHubItemDialog', 'GitLabItemDialog', 'LinearItemDrawer', 'JiraIssueWorkspace', 'PullRequestPage', 'TaskPage', 'automations', 'stats', 'mobile', 'emulator', 'skills'] },
];

function classify(key) {
  const p = key.split('.');
  if (!key.startsWith('auto.')) return { tier: 0, ns: p.slice(0, 2).join('.') };
  if (p[1] === 'components' && p[2] === 'settings') return { tier: 3, ns: 'settings.' + p[3] };
  const seg = p[2];
  for (const t of TIERS) if (t.match.includes(seg)) return { tier: t.tier, ns: p.slice(1, 3).join('.') };
  return { tier: 5, ns: p.slice(1, 3).join('.') };
}

// CSS / 選擇器 / keyframes 不是翻譯內容，計入字數會嚴重扭曲批次大小。
// components.feature 的 30,909 字裡有 28,179 字（91%）是 7 個 CSS 區塊，
// 曾讓這個命名空間被誤判為需要切 6 批的長文案，實際文案只有 2,730 字。
const isCode = s => /\{\s*[a-z-]+\s*:|@keyframes|^\.[a-z-]|\[data-|nth-of-type/i.test(s);

const groups = new Map();
let codeSkipped = 0, codeChars = 0;
for (const [k, v] of Object.entries(flat)) {
  if (typeof v !== 'string') continue;
  if (isCode(v)) { codeSkipped++; codeChars += v.length; continue; }
  const { tier, ns } = classify(k);
  const id = tier + '|' + ns;
  if (!groups.has(id)) groups.set(id, { tier, ns, keys: 0, chars: 0, items: [] });
  const g = groups.get(id);
  g.keys++; g.chars += v.length; g.items.push([k, v]);
}

// 印出某一批的實際內容（供逐批作業使用）
function emitBatch(n, nsList, sliceInfo) {
  console.log(`# 第 ${n} 批`);
  for (const ns of nsList) {
    const g = [...groups.values()].find(x => x.ns === ns);
    if (!g) continue;
    let items = g.items;
    if (sliceInfo && sliceInfo.ns === ns) {
      const per = Math.ceil(g.items.length / sliceInfo.total);
      items = g.items.slice((sliceInfo.index - 1) * per, sliceInfo.index * per);
      console.log(`\n## ${ns} (${sliceInfo.index}/${sliceInfo.total})  ${items.length} 句`);
    } else {
      console.log(`\n## ${ns}  ${items.length} 句`);
    }
    for (const [k, v] of items) console.log(`${k}\t${v}`);
  }
}

const TIER_NAME = {
  0: '手工精修區（品質已達標，僅抽查）',
  1: '高曝光介面',
  2: '長文案（導覽／功能牆）',
  3: '設定頁（量大、曝光低）',
  4: '外部整合',
  5: '長尾模組',
};

let batchNo = 0;
const lines = [];
let grandKeys = 0, grandChars = 0;

for (const tier of [1, 2, 3, 4, 5, 0]) {
  const rows = [...groups.values()].filter(g => g.tier === tier)
    .sort((a, b) => b.keys - a.keys);
  if (!rows.length) continue;
  const tKeys = rows.reduce((a, r) => a + r.keys, 0);
  const tChars = rows.reduce((a, r) => a + r.chars, 0);
  grandKeys += tKeys; grandChars += tChars;

  lines.push('');
  lines.push(`### Tier ${tier} — ${TIER_NAME[tier]}`);
  lines.push('');
  lines.push(`共 ${rows.length} 個模組、${tKeys} 句、${tChars.toLocaleString()} 字`);
  lines.push('');
  lines.push('| 批次 | 模組 | 句數 | 字數 |');
  lines.push('|---|---|---:|---:|');

  // 超過上限的大模組單獨切；其餘貪婪打包
  let cur = { keys: 0, chars: 0, ns: [] };
  const flush = () => {
    if (!cur.keys) return;
    batchNo++;
    if (WANT === batchNo) { emitBatch(batchNo, cur.ns); process.exit(0); }
    const shown = cur.ns.slice(0, MAX_NS_SHOWN).map(s => `\`${s}\``).join('<br>');
    const rest = cur.ns.length > MAX_NS_SHOWN ? `<br>…等 ${cur.ns.length} 個模組` : '';
    lines.push(`| #${batchNo} | ${shown}${rest} | ${cur.keys} | ${cur.chars.toLocaleString()} |`);
    cur = { keys: 0, chars: 0, ns: [] };
  };
  for (const r of rows) {
    if (r.keys > MAX_KEYS || r.chars > MAX_CHARS) {
      flush();
      const n = Math.ceil(Math.max(r.keys / MAX_KEYS, r.chars / MAX_CHARS));
      for (let i = 1; i <= n; i++) {
        batchNo++;
        if (WANT === batchNo) { emitBatch(batchNo, [r.ns], { ns: r.ns, index: i, total: n }); process.exit(0); }
        lines.push(`| #${batchNo} | \`${r.ns}\` (${i}/${n}) | ~${Math.ceil(r.keys / n)} | ~${Math.ceil(r.chars / n).toLocaleString()} |`);
      }
      continue;
    }
    if (cur.keys + r.keys > MAX_KEYS || cur.chars + r.chars > MAX_CHARS) flush();
    cur.keys += r.keys; cur.chars += r.chars; cur.ns.push(r.ns);
  }
  flush();
}

console.log(`> 本表由 \`node scripts/plan-batches.js\` 產生，資料變動後請重跑。`);
console.log(`> 上限：每批 ${MAX_KEYS} 句 / ${MAX_CHARS.toLocaleString()} 字。`);
console.log(`> 全檔合計 **${grandKeys} 句 / ${grandChars.toLocaleString()} 字**，共 **${batchNo} 批**。`);
console.log(lines.join('\n'));

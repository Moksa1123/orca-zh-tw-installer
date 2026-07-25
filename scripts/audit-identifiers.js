#!/usr/bin/env node
// 用 es/ja/ko 三語對照找出被誤譯的技術識別碼。
// 只處理「對照語言三者完全相同」且「看起來是識別碼而非句子」的項目。
const fs = require('fs');
const T = process.argv[2] || '.';
const P = require('path').join(__dirname,'..','orca_zh_TW_translation.json');

const L = {};
for (const l of ['es', 'ja', 'ko']) L[l] = JSON.parse(fs.readFileSync(`${T}/.ref-${l}.json`, 'utf8'));
const raw = fs.readFileSync(P, 'utf8');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const j = JSON.parse(raw);

// 識別碼特徵：全小寫技術詞、縮寫、路徑、檔名、分支名。排除一般英文句子。
const isIdentifier = s => {
  const t = s.trim();
  if (/\s/.test(t) && !/^[a-z0-9_.\/-]+$/i.test(t.replace(/\s/g, ''))) {
    // 有空格：只有「全大寫縮寫」或「像路徑」才算
    return /^[A-Z0-9 ]+$/.test(t) && t.length <= 12;
  }
  if (t.length > 28) return false;
  // 單一 token：全小寫技術詞、含 / . _ - 的路徑或檔名、全大寫縮寫
  return /^[a-z][a-z0-9]*$/.test(t)              // npm, tmux, stt, simctl, idle
      || /^[A-Z]{2,6}$/.test(t)                   // LAN, GPU, DAG, URL, PR
      || /^[A-Za-z0-9_.\/-]+$/.test(t) && /[\/._-]/.test(t);  // feat/mobile-page, PLAN.md, sk-...
};

// 只差大小寫的不算誤譯。對照語言把搜尋關鍵字全寫小寫（orca、gitlab、agent），
// 中文用的是品牌的正式寫法（Orca、GitLab、Agent）——搜尋不分大小寫，中文是對的。
// 若不排除，--write 會把整份字典的品牌名全部改成小寫。
const caseOnly = (a, b) => a.toLowerCase() === b.toLowerCase();

const keys = Object.keys(j).filter(k =>
  typeof j[k] === 'string' && k in L.es && k in L.ja && k in L.ko
  && L.es[k] === L.ja[k] && L.ja[k] === L.ko[k]
  && j[k] !== L.es[k] && !caseOnly(j[k], L.es[k]) && isIdentifier(L.es[k]));

console.log(`三語一致且判定為識別碼、中文卻不同：${keys.length} 處`);
console.log('（已排除僅大小寫不同者；中文若確實較佳，如「空閒」← idle，請勿套用）\n');
let n = 0;
for (const k of keys) {
  const want = L.es[k];
  console.log(`  ${JSON.stringify(j[k].slice(0, 24)).padEnd(26)} → ${JSON.stringify(want).padEnd(22)} ${k.replace(/^auto\./, '').split('.').slice(-2).join('.')}`);
  j[k] = want; n++;
}

if (process.argv.includes('--write')) {
  fs.writeFileSync(P, JSON.stringify(j, null, 2).replace(/\n/g, EOL), 'utf8');
  console.log(`\n✅ 套用 ${n} 處並寫入`);
} else {
  console.log(`\n（dry-run，共 ${n} 處。加 --write 才會寫入）`);
}

#!/usr/bin/env node
// 掃描已安裝的 Orca，找出「用翻譯後的標題去清單裡查、找不到就 throw」的查找點，
// 確認它們查的鍵都已列在 build-plugin.js 的 LOOKUP_BY_TITLE 排除名單。
//
// 背景見 build-plugin.js：這類鍵一旦翻譯，Orca 的語言快取競態會讓設定頁整頁崩潰。
// 排除名單是寫死的，Orca 改版可能新增查找點，所以每次跟新版都要跑這支。
const asar = require('@electron/asar');
const fs = require('fs');
const os = require('os');
const path = require('path');

const P = os.platform() === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'orca', 'resources', 'app.asar')
  : os.platform() === 'darwin'
    ? '/Applications/Orca.app/Contents/Resources/app.asar'
    : '/opt/Orca/resources/app.asar';

const buildSrc = fs.readFileSync(path.join(__dirname, 'build-plugin.js'), 'utf8');
const listed = new Set([...buildSrc.match(/const LOOKUP_BY_TITLE = new Set\(\[([\s\S]*?)\]\)/)[1]
  .matchAll(/'([^']+)'/g)].map(m => m[1]));

const files = asar.listPackage(P).map(f => f.split(path.sep).join('/').replace(/^\//, ''))
  .filter(f => /^out\/renderer\/assets\/.*\.js$/.test(f));

const found = new Map();
for (const f of files) {
  const c = asar.extractFile(P, f.split('/').join(path.sep)).toString('utf8');
  for (const m of c.matchAll(/function (\w+)\(e\)\{let t=\w+\(\)\.find\(t=>t\.\w+===e\);if\(!t\)throw/g)) {
    const fn = m[1].replace(/\$/g, '\\$');
    const re = new RegExp(`[^\\w$]${fn}\\(\\w+\\(\\x60([^\\x60]*)\\x60,\\x60([^\\x60]*)\\x60\\)\\)`, 'g');
    for (const k of c.matchAll(re)) found.set(k[1], { en: k[2], file: f.split('/').pop() });
  }
}

const missing = [...found.keys()].filter(k => !listed.has(k));
const stale = [...listed].filter(k => !found.has(k));
console.log(`查找點查的鍵：${found.size} 個，排除名單：${listed.size} 個`);
for (const k of missing) console.log(`❌ 未排除：${k}  "${found.get(k).en}"（${found.get(k).file}）`);
for (const k of stale) console.log(`ℹ️ 名單中但 Orca 已不再查找（可移除）：${k}`);
if (missing.length) {
  console.log('\n請把上面的鍵加進 scripts/build-plugin.js 的 LOOKUP_BY_TITLE，否則翻譯後會讓設定頁崩潰。');
  process.exit(1);
}
if (!found.size) console.log('⚠️ 一個查找點都沒找到：Orca 可能改了寫法，請人工確認此檢查仍有效。');
else console.log('✅ 所有查找鍵都已排除');

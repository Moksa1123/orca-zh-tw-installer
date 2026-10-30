#!/usr/bin/env node
// 用 Orca 的算法計算語言包涵蓋率。
//
// Orca 1.4.245 起，外掛語言包涵蓋率低於 80% 就不能被選為介面語言
// （仍可安裝，但語言選單裡選不到）。涵蓋率 = 語言包裡有翻、且存在於
// Orca 英文基準（out/main/chunks/en-*.js）的字串數 ÷ 英文基準字串數，無條件捨去。
// 受保護的外掛安全文案不算在語言包內。
//
// 用法：node scripts/coverage.js [語言包 JSON，預設 orca-plugin/locales/zh-TW.json]

const asar = require('@electron/asar');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PACK = path.resolve(process.argv[2] || path.join(ROOT, 'orca-plugin', 'locales', 'zh-TW.json'));
const P = process.env.ORCA_ASAR || {
  win32: path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'orca', 'resources', 'app.asar'),
  darwin: '/Applications/Orca.app/Contents/Resources/app.asar',
}[process.platform] || '/opt/Orca/resources/app.asar';

const files = asar.listPackage(P).map(f => f.split(path.sep).join('/').replace(/^\//, ''));
const read = f => asar.extractFile(P, f.split('/').join(path.sep)).toString('utf8');
const version = JSON.parse(read('package.json')).version;

const enFile = files.find(f => /^out\/main\/chunks\/en-[\w-]+\.js$/.test(f));
if (!enFile) { console.error('❌ 找不到 Orca 英文基準 out/main/chunks/en-*.js'); process.exit(2); }
const sb = { exports: {} }; sb.module = { exports: sb.exports };
vm.runInNewContext(read(enFile), sb, { timeout: 10000 });
const enRoot = sb.module.exports.default || sb.module.exports;

const paths = (obj, prefix = '', out = new Set()) => {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') { if (v.length) out.add(p); }
    else if (v && typeof v === 'object' && !Array.isArray(v)) paths(v, p, out);
  }
  return out;
};
const english = paths(enRoot);
const pack = paths(JSON.parse(fs.readFileSync(PACK, 'utf8')));
let hit = 0;
for (const p of pack) if (english.has(p)) hit++;
const pct = Math.floor(hit / english.size * 100);
console.log(`Orca ${version}：英文基準 ${english.size} 句，語言包命中 ${hit} 句 → 涵蓋率 ${pct}%`
  + `（${pct >= 80 ? '✅ 可選為介面語言' : '❌ 低於 80%，語言選單選不到'}）`);
process.exitCode = pct >= 80 ? 0 : 1;

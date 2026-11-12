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
// 1.4.257 起 chunk 開頭會 require("./rolldown-runtime-*.js")，沙箱要能載入同層 chunk
const loadChunk = file => {
  const sb = { exports: {} }; sb.module = { exports: sb.exports };
  sb.require = rel => loadChunk(path.posix.join(path.posix.dirname(file), rel));
  vm.runInNewContext(read(file), sb, { timeout: 10000 });
  return sb.module.exports;
};
const enExports = loadChunk(enFile);
const enRoot = enExports.default || enExports;

const paths = (obj, prefix = '', out = new Set()) => {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') { if (v.length) out.add(p); }
    else if (v && typeof v === 'object' && !Array.isArray(v)) paths(v, p, out);
  }
  return out;
};
const packRoot = JSON.parse(fs.readFileSync(PACK, 'utf8'));

// 優先用 Orca 自己的涵蓋率函式：1.4.247 起英文基準會先排除受保護的鍵
// （translatableCatalogPaths），自己重算容易跟不上。舊版沒有這個模組時才退回下面的算法。
let orcaCoverage = null;
const covFile = files.find(f => /^out\/shared\/plugins\/(?:.*\/)?plugin-language-pack-coverage\.js$/.test(f));
if (covFile) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-coverage-'));
  for (const f of files.filter(f => /^out\/shared\/.*\.(js|json)$/.test(f))) {
    const dst = path.join(tmp, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, read(f));
  }
  orcaCoverage = require(path.join(tmp, covFile));
  fs.rmSync(tmp, { recursive: true, force: true });
}

let english, hit, pct;
if (orcaCoverage) {
  english = orcaCoverage.translatableCatalogPaths(enRoot);
  pct = orcaCoverage.pluginLanguagePackCoverage(packRoot, english);
  hit = [...orcaCoverage.translatableCatalogPaths(packRoot)].filter(p => english.has(p)).length;
} else {
  english = paths(enRoot);
  hit = [...paths(packRoot)].filter(p => english.has(p)).length;
  pct = Math.floor(hit / english.size * 100);
}
console.log(`Orca ${version}：英文基準 ${english.size} 句，語言包命中 ${hit} 句 → 涵蓋率 ${pct}%`
  + `（${pct >= 80 ? '✅ 可選為介面語言' : '❌ 低於 80%，語言選單選不到'}）`);
process.exitCode = pct >= 80 ? 0 : 1;

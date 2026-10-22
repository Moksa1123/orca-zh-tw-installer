#!/usr/bin/env node
// 用「目前安裝的 Orca 自己的驗證程式」檢查外掛：manifest、語言包、市集索引。
//
// 我們自己寫的檢查（build-plugin.js）是照 Orca 原始碼抄的規則，Orca 改版時可能
// 悄悄變嚴格。直接拿 Orca 的 out/shared/plugins/*.js 來跑，才能確定它真的收。
//
// 用法：node scripts/validate-plugin.js [外掛目錄，預設 orca-plugin/]
// 需要 devDependency zod（Orca 把 zod 打包進 bundle，asar 裡沒有獨立的套件）。

const asar = require('@electron/asar');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.resolve(process.argv[2] || path.join(ROOT, 'orca-plugin'));
const P = process.env.ORCA_ASAR || {
  win32: path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'orca', 'resources', 'app.asar'),
  darwin: '/Applications/Orca.app/Contents/Resources/app.asar',
}[process.platform] || '/opt/Orca/resources/app.asar';

// 抽出 out/shared/ 到暫存目錄，並讓它 require('zod') 找得到本專案的 zod
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-validate-'));
for (const f of asar.listPackage(P).map(x => x.split(path.sep).join('/').replace(/^\//, ''))) {
  if (!f.startsWith('out/shared/')) continue;
  let buf; try { buf = asar.extractFile(P, f.split('/').join(path.sep)); } catch { continue; }
  const dst = path.join(tmp, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, buf);
}
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'), 'junction');

const plugins = path.join(tmp, 'out', 'shared', 'plugins');
const manifest = require(path.join(plugins, 'plugin-manifest.js'));
const pack = require(path.join(plugins, 'plugin-language-pack-artifact.js'));
const market = require(path.join(plugins, 'plugin-marketplace.js'));
const version = JSON.parse(asar.extractFile(P, 'package.json')).version;

let failed = false;
const report = (label, ok, detail) => { console.log(`${ok ? '✅' : '❌'} ${label}${detail ? '：' + detail : ''}`); if (!ok) failed = true; };

console.log(`以 Orca ${version} 的驗證程式檢查 ${path.relative(ROOT, DIR) || DIR}`);
const m = manifest.pluginManifestSchema.safeParse(JSON.parse(fs.readFileSync(path.join(DIR, 'orca-plugin.json'), 'utf8')));
report('manifest', m.success, m.success ? null : JSON.stringify(m.error.issues.slice(0, 3)));
if (m.success) {
  for (const lp of m.data.contributes.languagePacks) {
    const v = pack.parsePluginLanguagePackArtifact(fs.readFileSync(path.join(DIR, lp.path), 'utf8'));
    report(`語言包 ${lp.locale}`, v.ok, v.ok ? `${v.entries} 項` : v.error);
  }
}
const mf = path.join(DIR, 'orca-marketplace.json');
if (fs.existsSync(mf)) {
  const x = market.pluginMarketplaceSchema.safeParse(JSON.parse(fs.readFileSync(mf, 'utf8')));
  report('市集索引', x.success, x.success ? null : JSON.stringify(x.error.issues.slice(0, 3)));
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exitCode = failed ? 1 : 0;

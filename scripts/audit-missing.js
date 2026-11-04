#!/usr/bin/env node
// 找出目前安裝的 Orca 有、但字典還沒翻的字串。
//
// 兩個來源取聯集：
//   1. Orca 內建 es/ja/ko/fr 語系檔的鍵
//   2. 整份程式碼裡所有 t(`key`, `English`) 呼叫——新功能的字串常常官方其他語言
//      都還沒翻，只存在程式碼裡，光比對語系檔抓不到
//
// 用法：node scripts/audit-missing.js [輸出目錄]
//   會寫出 <輸出目錄>/todo.json：{ key: { en, es, ja, ko, fr } }，供翻譯使用
//   以及 obsolete.json：字典裡有、但目前版本已不存在的鍵（不會自動刪除）

const asar = require('@electron/asar');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(os.tmpdir(), 'orca-zh-tw-audit');
const P = process.env.ORCA_ASAR || {
  win32: path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'orca', 'resources', 'app.asar'),
  darwin: '/Applications/Orca.app/Contents/Resources/app.asar',
}[process.platform] || '/opt/Orca/resources/app.asar';

const files = asar.listPackage(P).map(f => f.split(path.sep).join('/').replace(/^\//, ''));
const read = f => { try { return asar.extractFile(P, f.split('/').join(path.sep)).toString('utf8'); } catch { return null; } };
const version = JSON.parse(read('package.json')).version;
const zh = JSON.parse(fs.readFileSync(path.join(ROOT, 'orca_zh_TW_translation.json'), 'utf8'));

// 官方語系。兩個來源都要讀：
//   main process：out/main/chunks/<lang>-<hash>.js（CJS，在只給空 exports 的沙箱裡執行）
//   renderer：     out/renderer/assets/<lang>-<hash>.json
// 1.4.245 起絕大多數字串搬到 renderer 的 JSON，main 只剩約 300 句；
// 只讀 main 的話會以為官方語系幾乎是空的。
// zh-Hant 是 1.4.245 內建的官方繁中（由簡體 OpenCC 轉換），只當語意參考，
// 它用「您」「工作樹」「代理程式」，不符合本專案用語。
const LANGS = ['es', 'ja', 'ko', 'fr', 'de', 'pt', 'zh-Hant'];
const flatten = (obj, out = {}, p = '') => {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[p + k] = v;
    else if (v && typeof v === 'object') flatten(v, out, p + k + '.');
  }
  return out;
};
const refs = {};
for (const lang of LANGS) {
  const flat = {};
  const esc = lang.replace(/-/g, '\\-');
  const mainFile = files.find(x => new RegExp(`^out/main/chunks/${esc}-[\\w-]+\\.js$`).test(x));
  if (mainFile) {
    const sb = { exports: {} }; sb.module = { exports: sb.exports };
    vm.runInNewContext(read(mainFile), sb, { timeout: 10000 });
    const m = sb.module.exports;
    flatten(m.default && typeof m.default === 'object' ? m.default : m, flat);
  }
  const rendererFile = files.find(x => new RegExp(`^out/renderer/assets/${esc}-[\\w-]+\\.json$`).test(x));
  if (rendererFile) flatten(JSON.parse(read(rendererFile)), flat);
  refs[lang] = flat;
}
const official = new Set(Object.values(refs).flatMap(o => Object.keys(o)));

// 程式碼裡的翻譯呼叫。鍵的第一段限定為已知命名空間，避免把一般字串誤當成鍵。
const roots = [...new Set([...official, ...Object.keys(zh)].map(k => k.split('.')[0]))];
const rootAlt = roots.map(r => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const callRe = new RegExp(
  '\\b[\\w$]{1,4}\\(\\s*([`"\'])((?:' + rootAlt + ')\\.[\\w.-]+)\\1\\s*,\\s*([`"\'])((?:(?!\\3)[^\\\\]|\\\\.)*)\\3', 'g');
const code = {};
for (const f of files) {
  if (!/^out\/(renderer|main)\/.*\.js$/.test(f) || /\/(es|fr|ja|ko|zh)-[\w-]+\.js$/.test(f)) continue;
  const c = read(f); if (!c) continue;
  for (const m of c.matchAll(callRe)) if (!(m[2] in code)) code[m[2]] = m[4];
}

const all = new Set([...Object.keys(code), ...official]);
const missing = [...all].filter(k => !(k in zh)).sort();
const obsolete = Object.keys(zh).filter(k => !all.has(k)).sort();

const todo = {};
for (const k of missing) {
  todo[k] = { en: code[k] ?? null };
  for (const l of LANGS) todo[k][l] = refs[l][k] ?? null;
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'todo.json'), JSON.stringify(todo, null, 1));
fs.writeFileSync(path.join(OUT, 'obsolete.json'), JSON.stringify(obsolete, null, 1));

// 受保護的外掛安全文案：語言包不准改寫，放進去整包會被拒。規則會隨 Orca 版本擴大
// （1.4.245 新增 Native Chat 權限核准、瀏覽器網站權限等），所以直接用 Orca 自己的
// isProtectedPluginTranslationPath 判斷，不在建置腳本裡抄一份。
let protectedKeys = [];
{
  const art = files.find(f => /^out\/shared\/plugins\/(?:.*\/)?plugin-language-pack-artifact\.js$/.test(f));
  const chrome = files.find(f => /^out\/shared\/plugins\/(?:.*\/)?plugin-translatable-chrome\.js$/.test(f));
  if (art && chrome) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-protected-'));
    // 1.4.247 起 artifact 會 require 同層以外的模組與 JSON（../languages/plugin-protected-copy），
    // 只複製這兩個檔案會載入失敗，所以整個 out/shared 一起複製
    for (const f of files.filter(f => /^out\/shared\/.*\.(js|json)$/.test(f))) {
      const dst = path.join(tmp, f);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, read(f));
    }
    const mod = require(path.join(tmp, art));
    if (typeof mod.isProtectedPluginTranslationPath === 'function') {
      protectedKeys = Object.keys(zh).filter(k => mod.isProtectedPluginTranslationPath(k)).sort();
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
fs.writeFileSync(path.join(OUT, 'protected.json'), JSON.stringify(protectedKeys, null, 1));

console.log(`Orca ${version}：程式碼翻譯呼叫 ${Object.keys(code).length}、官方語系鍵 ${official.size}`);
console.log(`缺少 ${missing.length} 句（其中只在程式碼裡 ${missing.filter(k => !official.has(k)).length} 句、`
  + `有英文原文 ${missing.filter(k => code[k] != null).length} 句）`);
console.log(`字典裡已不存在於此版的鍵 ${obsolete.length} 個、受保護（不可放進語言包）${protectedKeys.length} 個`);
const byNs = {};
for (const k of missing) { const n = k.split('.').slice(0, 3).join('.'); byNs[n] = (byNs[n] || 0) + 1; }
Object.entries(byNs).sort((a, b) => b[1] - a[1]).slice(0, 15)
  .forEach(([n, c]) => console.log(String(c).padStart(6), n));
console.log(`→ ${path.join(OUT, 'todo.json')}`);
process.exitCode = missing.length ? 1 : 0;

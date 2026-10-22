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

// 官方語系（main process 的 CJS chunk，在只給空 exports 的沙箱裡執行）
const refs = {};
for (const lang of ['es', 'ja', 'ko', 'fr']) {
  const f = files.find(x => new RegExp(`^out/main/chunks/${lang}-[\\w-]+\\.js$`).test(x));
  const flat = {};
  if (f) {
    const sb = { exports: {} }; sb.module = { exports: sb.exports };
    vm.runInNewContext(read(f), sb, { timeout: 10000 });
    const m = sb.module.exports;
    const rootObj = m.default && typeof m.default === 'object' ? m.default : m;
    (function walk(o, p) {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string') flat[p + k] = v;
        else if (v && typeof v === 'object') walk(v, p + k + '.');
      }
    })(rootObj, '');
  }
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
  for (const l of ['es', 'ja', 'ko', 'fr']) todo[k][l] = refs[l][k] ?? null;
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'todo.json'), JSON.stringify(todo, null, 1));
fs.writeFileSync(path.join(OUT, 'obsolete.json'), JSON.stringify(obsolete, null, 1));

console.log(`Orca ${version}：程式碼翻譯呼叫 ${Object.keys(code).length}、官方語系鍵 ${official.size}`);
console.log(`缺少 ${missing.length} 句（其中只在程式碼裡 ${missing.filter(k => !official.has(k)).length} 句、`
  + `有英文原文 ${missing.filter(k => code[k] != null).length} 句）`);
console.log(`字典裡已不存在於此版的鍵 ${obsolete.length} 個`);
const byNs = {};
for (const k of missing) { const n = k.split('.').slice(0, 3).join('.'); byNs[n] = (byNs[n] || 0) + 1; }
Object.entries(byNs).sort((a, b) => b[1] - a[1]).slice(0, 15)
  .forEach(([n, c]) => console.log(String(c).padStart(6), n));
console.log(`→ ${path.join(OUT, 'todo.json')}`);
process.exitCode = missing.length ? 1 : 0;

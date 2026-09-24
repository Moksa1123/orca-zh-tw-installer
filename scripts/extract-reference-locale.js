#!/usr/bin/env node
// 從已安裝的 app.asar 抽出其他語言的語系檔，作為判斷原文語意的對照。
//
// 為什麼需要：Orca 沒有 en 語系檔（英文是內嵌的 fallback），所以無法直接
// 取得原文。但 es/ja/ko 的 key 與中文完全相同，且那些翻譯的品質明顯較好，
// 可用來反推原意——尤其是單字標籤（bong/ding/ogg/aac 這種）。
//
// 用法： node scripts/extract-reference-locale.js [es|ja|ko] > ref.json
const asar = require('@electron/asar');
const os = require('os');
const path = require('path');
const fs = require('fs');

const LANG = process.argv[2] || 'es';
const P = os.platform() === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'orca', 'resources', 'app.asar')
  : os.platform() === 'darwin'
    ? '/Applications/Orca.app/Contents/Resources/app.asar'
    : '/opt/Orca/resources/app.asar';

if (!fs.existsSync(P)) { console.error(`❌ 找不到 app.asar：${P}`); process.exit(1); }

const norm = f => f.split(path.sep).join('/').replace(/^\//, '');
const get = f => asar.extractFile(P, f.split('/').join(path.sep)).toString('utf8');

const file = asar.listPackage(P).map(norm)
  .find(f => new RegExp(`out/main/chunks/${LANG}-[A-Za-z0-9_-]+\\.js$`).test(f));
if (!file) { console.error(`❌ 找不到 ${LANG} 語系 chunk`); process.exit(1); }

const src = get(file);

// 取出語系物件，攤平成點分鍵。
const out = {};
const flatten = (obj, prefix) => {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[prefix + k] = v;
    else if (v && typeof v === 'object') flatten(v, prefix + k + '.');
  }
};

// Orca 1.4.2xx 起 main process 改成壓縮輸出，語系 chunk 變成
//   const e={...},t={...};…;exports.default=m,exports.menu=r,…
// 不再是一行一個 `const 名稱 = {...}`，舊的正則解析會抓到 0 條。
// 它本身是合法的 CommonJS 資料模組，所以直接在 vm 沙箱裡執行，
// 只給它一個空的 exports——沒有 require、沒有 process，碰不到檔案系統或網路。
const vm = require('vm');
const sandbox = { exports: {} };
sandbox.module = { exports: sandbox.exports };
vm.runInNewContext(src, sandbox, { timeout: 10000 });
const mod = sandbox.module.exports.default ? sandbox.module.exports : sandbox.exports;
const root = mod.default && typeof mod.default === 'object' ? mod.default : mod;
flatten(root, '');
const count = Object.keys(root).length;

console.error(`來源：${file}`);
console.error(`解析 ${count} 個頂層物件，共 ${Object.keys(out).length} 條`);
process.stdout.write(JSON.stringify(out, null, 2));

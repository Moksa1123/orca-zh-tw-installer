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

// chunk 形如： const app = {...}; const settings = {...}; … exports.app = app; …
// 取出每個頂層 const 的物件字面值，攤平成點分鍵。
const out = {};
const flatten = (obj, prefix) => {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[prefix + k] = v;
    else if (v && typeof v === 'object') flatten(v, prefix + k + '.');
  }
};

// chunk 裡有兩種寫法：
//   const X = {...};                              直接的物件字面值
//   const X = /* @__PURE__ */ JSON.parse('...');  JSON 字串（最大的 auto 用這種）
// 後者需要先求值那個字串字面值。用 vm 在無全域的沙箱裡只跑這一個純運算式，
// 不引入任何可存取檔案系統或網路的東西。
const vm = require('vm');
const evalExpr = expr => vm.runInNewContext(expr, Object.create(null), { timeout: 5000 });

let count = 0;
// 字串可能用單引號或反引號包住（es 用 '，ja/ko 用 `），兩種都要吃。
for (const m of src.matchAll(/^const ([A-Za-z_$][\w$]*) = (?:\/\* @__PURE__ \*\/ )?(JSON\.parse\((?:'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\)|\{[\s\S]*?\});$/gm)) {
  const [, name, expr] = m;
  let obj;
  try {
    obj = expr.startsWith('JSON.parse')
      ? evalExpr(`(function(){const JSON=this.J;return ${expr}})`).call({ J: JSON })
      : JSON.parse(expr);
  } catch { continue; }
  if (!obj || typeof obj !== 'object') continue;
  flatten(obj, name + '.');
  count++;
}

console.error(`來源：${file}`);
console.error(`解析 ${count} 個頂層物件，共 ${Object.keys(out).length} 條`);
process.stdout.write(JSON.stringify(out, null, 2));

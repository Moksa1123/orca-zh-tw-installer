#!/usr/bin/env node
// 驗證「已安裝的」app.asar 是否真的含有核心的語言切換補丁與字典。
// 用法： node scripts/verify-install.js
//
// 重要：這裡的每一項檢查都必須跟 index.js 對應補丁的 done() 判斷式保持一致，
// 否則補丁邏輯改了、這裡沒跟著改，就會出現「明明裝成功卻被判定失敗」的假警報
// ——這正是 2.13.12 之前發生過的事：index.js 為了適配 Orca 1.4.161 把
// locale gate／字典 loader 從 I18nProvider 搬到 jsx-runtime chunk、
// main process 也從具名常數改成字面值陣列，但這支腳本沒跟著更新，
// 於是對著已經不含這些內容的舊錨點檢查，13 項全部誤判失敗。
const asar = require('@electron/asar');
const os = require('os');
const path = require('path');
const fs = require('fs');

const platform = os.platform();
const orcaPath = platform === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'orca', 'resources', 'app.asar')
  : platform === 'darwin'
    ? '/Applications/Orca.app/Contents/Resources/app.asar'
    : '/opt/Orca/resources/app.asar';

if (!fs.existsSync(orcaPath)) {
  console.error(`❌ 找不到 app.asar：${orcaPath}`);
  process.exit(1);
}

const inAsar = p => p.split('/').join(path.sep);
const get = f => asar.extractFile(orcaPath, inAsar(f)).toString('utf8');
const list = () => asar.listPackage(orcaPath).map(f => f.replace(/\\/g, '/').replace(/^\//, ''));

let fail = 0;
const check = (label, cond) => {
  console.log(`  ${cond ? '✅' : '❌'} ${label}`);
  if (!cond) fail++;
};

console.log(`\n檢查 ${orcaPath}`);
console.log(`備份存在 (app.asar.bak)：${fs.existsSync(orcaPath + '.bak') ? '✅' : '⚠ 無'}\n`);

const files = list();

console.log('=== main process (out/main/index.js) ===');
const m = get('out/main/index.js');
check('zh-TW 常數', m.includes('UI_LANGUAGE_TRADITIONAL_CHINESE = "zh-TW"'));
check('語言列舉白名單（UI_LANGUAGE_VALUES）',
  m.includes('var UI_LANGUAGE_VALUES = new Set([\n\tUI_LANGUAGE_SYSTEM,\n\t"en",\n\t"zh",\n\t"zh-TW",'));
check('locale 白名單含 zh-TW（SUPPORTED_UI_LOCALES）',
  m.includes('const SUPPORTED_UI_LOCALES = [\n\t"en",\n\t"zh",\n\t"zh-TW",\n\t"ko",\n\t"ja",\n\t"es"\n];'));
check('zh-tw/zh-hk/zh-hant 不再退回英文',
  m.includes('if (tag.startsWith("zh-tw") || tag.startsWith("zh-hk") || tag.startsWith("zh-hant")) return "zh-TW";'));
check('resolveUiLocale 有 zh-TW 分支',
  m.includes('if (language === "zh-TW") return "zh-TW";'));
check('main process 字典 loader',
  m.includes('"zh-TW": () => Promise.resolve().then(() => require("./chunks/zh-TW-nested.js"))'));

// renderer 端的語言常數／列舉／下拉選單／字典 loader 現在都在 jsx-runtime chunk
// （檔名帶 build hash，靠內容找），不是 I18nProvider。
console.log('\n=== renderer / jsx-runtime chunk ===');
const rendererAssetFiles = files.filter(f => /^out\/renderer\/assets\/.*\.js$/.test(f));
const jsxRuntimeName = rendererAssetFiles.find(f => {
  try { return get(f).includes('var UI_LANGUAGE_VALUES = new Set'); } catch { return false; }
});
if (!jsxRuntimeName) {
  console.error('❌ 找不到含 UI_LANGUAGE_VALUES 的 jsx-runtime chunk，Orca 可能已大幅更改架構！');
  fail++;
} else {
  console.log(`（檔案：${jsxRuntimeName}）`);
  const r = get(jsxRuntimeName);
  check('語言列舉加入 zh-TW',
    r.includes('var UI_LANGUAGE_VALUES = new Set([\n\tUI_LANGUAGE_SYSTEM,\n\t"en",\n\t"zh",\n\t"zh-TW",'));
  check('語言下拉選單加入繁中',
    r.includes('value: "zh-TW",\n\t\tlabelKey: "settings.appearance.language.traditionalChinese"'));
  check('語言名稱 fallback 加入繁中',
    r.includes('["zh-TW"]: "中文（繁體）"'));
  check('renderer 字典 loader',
    r.includes('"zh-TW": () => __vitePreload'));
  check('locale 白名單含 zh-TW（SUPPORTED_UI_LOCALES）',
    r.includes('const SUPPORTED_UI_LOCALES = [\n\t"en",\n\t"zh",\n\t"zh-TW",\n\t"ko",\n\t"ja",\n\t"es"\n];'));
  check('zh-tw/zh-hk/zh-hant 不再退回英文',
    r.includes('if (tag.startsWith("zh-tw") || tag.startsWith("zh-hk") || tag.startsWith("zh-hant")) return "zh-TW";'));
  check('resolveUiLocale 有 zh-TW 分支',
    r.includes('if (language === "zh-TW") return "zh-TW";'));
}

console.log('\n=== 字典檔 ===');
const esmPath = 'out/renderer/assets/zh-TW-nested.js';
const cjsPath = 'out/main/chunks/zh-TW-nested.js';
check(`${esmPath} 存在`, files.includes(esmPath));
check(`${cjsPath} 存在`, files.includes(cjsPath));

if (files.includes(esmPath)) {
  const esm = get(esmPath);
  check('ESM 為 export default', esm.trimStart().startsWith('export default'));
  try {
    const obj = JSON.parse(esm.trim().replace(/^export default\s*/, '').replace(/;$/, ''));
    let n = 0;
    (function w(o) { for (const k in o) typeof o[k] === 'string' ? n++ : w(o[k]); })(obj);
    // 期望值不可寫死。原本寫 11020，字典成長到 11157 之後這項就一直誤報失敗，
    // 而已安裝的字典其實完全正確。改為從來源 JSON 推算，字典再增減都不會失效。
    // 找不到來源 JSON（只裝了 npm 套件、沒有專案）時就只回報數量，不判定成敗。
    let expected = null;
    try {
      const srcJson = path.join(__dirname, '..', 'orca_zh_TW_translation.json');
      expected = Object.keys(JSON.parse(fs.readFileSync(srcJson, 'utf8'))).length;
    } catch { /* 沒有來源檔，跳過比對 */ }
    if (expected === null) {
      console.log(`  ℹ️ ESM 字串數 = ${n}（找不到來源 JSON，略過比對）`);
    } else {
      check(`ESM 字串數 = ${n}（來源 ${expected}）`, n === expected);
    }
    check('抽樣：menu.openWorktreePalette = 「開啟 Worktree 面板」',
      obj.menu && obj.menu.openWorktreePalette === '開啟 Worktree 面板');
    check('抽樣：無「儲存函式程式庫」殘留', !esm.includes('儲存函式程式庫'));
  } catch (e) {
    check('ESM 可解析', false);
  }
}
if (files.includes(cjsPath)) {
  const cjs = get(cjsPath);
  check('CJS 有 exports.default', cjs.includes('exports.default = zhTW;'));
  check('CJS 有 "use strict"', cjs.trimStart().startsWith('"use strict"'));
}

// ── 真正的 JS 語法驗證 ──
// 字典是 lazy chunk，由 __vitePreload / require 動態載入。若語法有問題，
// Orca 會拋「Unexpected token」並讓面板的 error boundary 接住。
// JSON.parse 過不代表 JS parser 過：JSON 容許 U+2028/U+2029 等字元，
// 舊版 JS 的字串字面值不容許。故用 node --check 實際跑一次 parser。
console.log('\n=== JS 語法驗證（node --check）===');
{
  const { execFileSync } = require('child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-zh-tw-syntax-'));
  const cases = [
    ['ESM（renderer）', esmPath, 'dict.mjs'],
    ['CJS（main process）', cjsPath, 'dict.cjs'],
  ];
  for (const [label, inAsarPath, name] of cases) {
    if (!files.includes(inAsarPath)) { check(`${label} 存在`, false); continue; }
    const f = path.join(tmp, name);
    fs.writeFileSync(f, get(inAsarPath), 'utf8');
    let ok = true, err = '';
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      ok = false;
      err = String(e.stderr || e.message).split('\n').find(l => /Error|Unexpected/.test(l)) || '';
    }
    check(`${label} 通過 node --check${ok ? '' : '  ← ' + err}`, ok);
  }
  // JSON 合法但 JS 可能出問題的字元
  for (const [label, inAsarPath] of [['ESM', esmPath], ['CJS', cjsPath]]) {
    if (!files.includes(inAsarPath)) continue;
    const s = get(inAsarPath);
    // U+2028/U+2029 必須用 \u 轉義。直接把字元寫進正則字面值，JS 會把它們當成
    // 行終止符而切斷字面值——正是這裡要檢查的那類問題（本檔案踩過一次）。
    const bad = (s.match(/[\u2028\u2029]/g) || []).length
      + (s.match(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g) || []).length
      + (s.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
    check(`${label} 無 U+2028/2029、孤立代理對、控制字元`, bad === 0);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(fail === 0
  ? '\n🎉 全部通過！完全關閉並重啟 Orca，到 Settings → Appearance → Language 選「中文（繁體）」。\n'
  : `\n❌ 有 ${fail} 項未通過。可用備份還原：\n   Copy-Item "${orcaPath}.bak" "${orcaPath}" -Force\n`);
process.exit(fail === 0 ? 0 : 1);

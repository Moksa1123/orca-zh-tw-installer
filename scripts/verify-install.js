#!/usr/bin/env node
// 驗證「已安裝的」app.asar 是否真的含有全部補丁與字典。
// 用法： node scripts/verify-install.js
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

// asar 內部路徑用平台分隔符
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
const i18nName = files.find(f => /out\/renderer\/assets\/I18nProvider-.*\.js$/.test(f));
if (!i18nName) { console.error('❌ 找不到 I18nProvider'); process.exit(1); }

const LOCALE_GATE = [
  ['locale 白名單含 zh-TW', c => c.includes('["en", "zh", "zh-TW", "ko", "ja", "es"]')],
  ['zh-tw 不再退回英文', c => /tag\.startsWith\("zh-hant"\)\)\s*\{\s*return "zh-TW";/.test(c)],
  ['resolveUiLocale 有 zh-TW 分支', c => c.includes('if (language === "zh-TW") {')],
];

console.log('=== main process (out/main/index.js) ===');
const m = get('out/main/index.js');
check('zh-TW 常數', m.includes('UI_LANGUAGE_TRADITIONAL_CHINESE = "zh-TW"'));
check('語言列舉白名單', m.includes('UI_LANGUAGE_TRADITIONAL_CHINESE,'));
for (const [l, f] of LOCALE_GATE) check(l, f(m));
check('字典 loader', m.includes('"zh-TW": () => Promise.resolve().then(() => require("./chunks/zh-TW-nested.js"))'));

console.log(`\n=== renderer (${i18nName}) ===`);
const r = get(i18nName);
check('zh-TW 常數', r.includes('UI_LANGUAGE_TRADITIONAL_CHINESE = "zh-TW"'));
check('語言列舉白名單', r.includes('UI_LANGUAGE_TRADITIONAL_CHINESE,'));
check('下拉選單項目', r.includes('labelKey: "settings.appearance.language.traditionalChinese"'));
check('語言名稱 fallback', r.includes('[UI_LANGUAGE_TRADITIONAL_CHINESE]: "中文（繁體）"'));
check('字典 loader', r.includes('"zh-TW": () => __vitePreload(() => import("./zh-TW-nested.js")'));
for (const [l, f] of LOCALE_GATE) check(l, f(r));

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
    check(`ESM 字串數 = 11020（實際 ${n}）`, n === 11020);
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

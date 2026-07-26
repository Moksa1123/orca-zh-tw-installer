#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('\n🐳 歡迎使用 Orca 台灣繁體中文 (zh-TW) 一鍵安裝包！\n');

const platform = os.platform();
let orcaPath = '';

if (platform === 'win32') {
  orcaPath = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'orca', 'resources', 'app.asar');
} else if (platform === 'darwin') {
  orcaPath = '/Applications/Orca.app/Contents/Resources/app.asar';
} else {
  orcaPath = '/opt/Orca/resources/app.asar';
}

if (!fs.existsSync(orcaPath)) {
  console.error(`❌ 找不到 Orca 安裝路徑！(${orcaPath})`);
  console.error('如果您的 Orca 安裝在其他位置，請手動替換 app.asar。');
  process.exit(1);
}

const asar = require('@electron/asar');
// --dry-run：解包、修補、驗證，但不備份也不重新打包。
// 可在 Orca 執行中安全使用，用來確認 Orca 更新後錨點是否仍然有效。
const DRY_RUN = process.argv.includes('--dry-run');
// --force：略過「Orca 是否執行中」的檢查。不建議使用，見 countRunningOrca 的說明。
const FORCE = process.argv.includes('--force');

// --verify：檢查已安裝的 app.asar 是否含全部補丁與字典。
// 透過 npx 安裝的人沒有專案目錄，無法用 npm run verify，故在此提供同一個入口。
if (process.argv.includes('--verify')) {
  require('./scripts/verify-install.js');   // 該腳本會自行輸出結果並設定結束碼
  return;
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`用法： npx orca-zh-tw-installer [選項]

  （無選項）    套用繁體中文語系包。需先完全關閉 Orca。
  --dry-run    只檢查相容性，不改動 Orca。可在 Orca 執行中安全使用。
  --verify     檢查已安裝的 app.asar 是否含全部補丁與字典。
  --force      即使 Orca 執行中也強制套用（不建議）。
  --help       顯示這段說明。
`);
  return;
}
const workDir = path.join(os.tmpdir(), DRY_RUN ? 'orca-zh-tw-patcher-dry' : 'orca-zh-tw-patcher');
const unpackedDir = path.join(workDir, 'app.asar.unpacked');

const MARK = 'UI_LANGUAGE_TRADITIONAL_CHINESE = "zh-TW"';

/**
 * 偵測 Orca 是否還在執行。
 *
 * 為什麼要擋：重新打包 app.asar 之後，仍在執行的 Orca 其 renderer 還握著
 * 舊的 lazy chunk 檔名，去載入時檔案已被換掉，會拋出
 * 「Unexpected token」並讓側邊欄等面板的 error boundary 接住。
 * 那是一次性的、重啟即消失的錯誤，但很容易被誤認為語系包壞了。
 *
 * 回傳 process 數量；無法判斷時回傳 -1（不阻擋）。
 */
function countRunningOrca() {
  const { execFileSync } = require('child_process');
  const run = (cmd, args) => {
    try {
      return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { return null; }
  };
  if (platform === 'win32') {
    const out = run('tasklist', ['/FI', 'IMAGENAME eq Orca.exe', '/NH']);
    if (out === null) return -1;
    return out.split(/\r?\n/).filter(l => /Orca\.exe/i.test(l)).length;
  }
  // macOS / Linux：-x 只比對完全相符的程序名，避免抓到自己的 npx/node
  const out = run('pgrep', ['-x', platform === 'darwin' ? 'Orca' : 'orca']);
  if (out === null) return 0;   // pgrep 找不到時回傳非 0 退出碼，會落到 catch
  return out.split('\n').filter(Boolean).length;
}

/**
 * 修補器：每個修補都要宣告「如何判斷已完成」。
 * 若錨點找不到且尚未完成，就記為失敗——絕不靜默略過。
 */
function createPatcher(label, filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  const ok = [];
  const failed = [];
  return {
    label,
    /**
     * @param name  修補名稱（顯示用）
     * @param done  (code) => boolean，判斷是否已修補過
     * @param find  string | RegExp 錨點
     * @param repl  取代內容
     */
    patch(name, done, find, repl) {
      if (done(code)) { ok.push(`${name}（已存在）`); return; }
      const before = code;
      code = code.replace(find, repl);
      if (code === before || !done(code)) failed.push(name);
      else ok.push(name);
    },
    save() { fs.writeFileSync(filePath, code); },
    get ok() { return ok; },
    get failed() { return failed; },
  };
}

// ── 共用修補：三處新版 Orca 才有的 zh-TW 阻擋點 ──────────────────────────
// A. locale 白名單沒有 zh-TW
// B. normalizeSupportedUiLocale() 明確把 zh-tw / zh-hk / zh-hant 打回 DEFAULT_UI_LOCALE("en")
// C. resolveUiLocale() 沒有 zh-TW 分支，選了繁中會掉出 if 鏈變成 "en"
function patchLocaleGate(p) {
  p.patch('locale 白名單加入 zh-TW',
    c => c.includes('const SUPPORTED_UI_LOCALES = ["en", "zh", "zh-TW", "ko", "ja", "es"]'),
    'const SUPPORTED_UI_LOCALES = ["en", "zh", "ko", "ja", "es"];',
    'const SUPPORTED_UI_LOCALES = ["en", "zh", "zh-TW", "ko", "ja", "es"];');

  p.patch('解除 zh-tw/zh-hk/zh-hant 退回英文',
    c => /tag\.startsWith\("zh-hant"\)\)\s*\{\s*return "zh-TW";/.test(c),
    /(if \(tag\.startsWith\("zh-tw"\) \|\| tag\.startsWith\("zh-hk"\) \|\| tag\.startsWith\("zh-hant"\)\) \{\s*)return DEFAULT_UI_LOCALE;/,
    '$1return "zh-TW";');

  p.patch('resolveUiLocale 加入 zh-TW 分支',
    c => c.includes('if (language === "zh-TW") {'),
    /(if \(language === UI_LANGUAGE_CHINESE\) \{\s*return "zh";\s*\})/,
    '$1\n  if (language === "zh-TW") {\n    return "zh-TW";\n  }');
}

// ── 原生選單本地化 ─────────────────────────────────────────────────────
// Orca 的 Electron 原生選單有兩類字串完全沒有經過 i18n，語系檔再完整也翻不到：
//
//   1. { role: "undo" } 這種沒給 label 的項目。label 由 Electron 自己提供，
//      而 Electron 只在 macOS 從系統取得本地化字串，Windows／Linux 是寫死英文。
//      所以「編輯」選單會出現 Undo / Redo / Cut / Copy / Select All 全英文，
//      只有 Paste 是中文——因為 Orca 給 Paste 寫了 label（它有自訂行為）。
//
//   2. Markdown 右鍵選單的標籤是直接寫在原始碼裡的字面值
//      （markdownCommandItem("Bold", …)、label: "Format"），根本沒有對應的鍵。
//
// 兩類都靠改寫 main process 原始碼解決：注入 translateMain(...) 呼叫。
// translateMain 是 Orca 自己的翻譯函式，定義在該檔案的模組作用域，
// 所有選單建構點都在其後，可安全呼叫。
const MENU_ROLE_LABELS = {
  about: 'About', services: 'Services', hide: 'Hide', hideOthers: 'Hide Others',
  unhide: 'Show All', quit: 'Quit', undo: 'Undo', redo: 'Redo', cut: 'Cut',
  copy: 'Copy', selectAll: 'Select All', toggleDevTools: 'Toggle Developer Tools',
  togglefullscreen: 'Toggle Full Screen', minimize: 'Minimize', zoom: 'Zoom',
};
// 字面值 → 鍵名。必須連呼叫包裝一起比對：「Quote」在全檔出現 5 次，
// 但只有 markdownCommandItem("Quote" 這一處是選單標籤。
const MENU_MD_ITEMS = {
  'Add link': 'addLink', 'Bold': 'bold', 'Italic': 'italic', 'Strike': 'strike',
  'Inline code': 'inlineCode', 'Code block': 'codeBlock', 'Quote': 'quote',
  'Body text': 'bodyText', 'Heading 1': 'heading1', 'Heading 2': 'heading2',
  'Heading 3': 'heading3', 'Heading 4': 'heading4', 'Heading 5': 'heading5',
  'Bullet list': 'bulletList', 'Numbered list': 'numberedList', 'Checklist': 'checklist',
  'Link': 'link', 'Image': 'image', 'Divider': 'divider',
};
const MENU_SUBMENU_LABELS = { 'Format': 'format', 'Paragraph': 'paragraph', 'Insert': 'insert' };
const MENU_PASTE_ITEMS = { 'Paste': 'paste', 'Paste as plain text': 'pasteAsPlainText' };

const t = (key, en) => `translateMain("nativeMenu.${key}", ${JSON.stringify(en)})`;

// ── 快速鍵名稱本地化 ───────────────────────────────────────────────────
// 「設定 → 快速鍵」列出的 85 個命令名稱與 9 個群組標題，都是寫死在
// KEYBINDING_DEFINITIONS 陣列裡的英文字面值，沒有對應的語系鍵。
//
// 改成 getter 而不是直接呼叫 translate()：這個陣列在模組載入時就求值，
// 那時 i18n 還沒載入 zh-TW 資源，直接呼叫只會拿到英文 fallback 並永久固定。
// getter 是讀取時才求值，所以拿得到翻譯。展開（{...definition}）也會
// 觸發 getter 並複製出字串，不影響既有邏輯。
const KEYBINDING_GROUP_SLUGS = {
  'Global': 'global', 'Tabs': 'tabs', 'Tab Navigation': 'tabNavigation',
  'Quick Commands': 'quickCommands', 'Browser': 'browser', 'Editors': 'editors',
  'File Explorer': 'fileExplorer', 'Settings': 'settings', 'Terminal Panes': 'terminalPanes',
  'Agents': 'agents',
};

function patchKeybindingTitles(p, translateFn) {
  p.patch('快速鍵名稱與群組改走 i18n',
    c => c.includes('keybindingGroup.'),
    // id 緊接 title、group、scope 是 keybinding 定義獨有的形狀。
    // 不能只比對 group:"…"——built-in／imported 等其他結構也有 group 欄位。
    /id: "([^"]+)",(\s*)title: "([^"]+)",(\s*)group: "([^"]+)",(\s*)scope:/g,
    (m, id, s1, title, s2, group, s3) => {
      const slug = KEYBINDING_GROUP_SLUGS[group];
      if (!slug) return m;   // 未知群組就整段不動，寧可留英文也不要改壞
      const tTitle = `${translateFn}("keybinding.${id}", ${JSON.stringify(title)})`;
      const tGroup = `${translateFn}("keybindingGroup.${slug}", ${JSON.stringify(group)})`;
      return `id: ${JSON.stringify(id)},${s1}get title() { return ${tTitle}; },`
        + `${s2}get group() { return ${tGroup}; },${s3}scope:`;
    });
}

// ── 選項清單標籤本地化 ─────────────────────────────────────────────────
// Orca 用 { id: "x", label: "English" } 描述選項清單，label 全是寫死的英文：
//   DEFAULT_WORKSPACE_STATUSES   側邊欄／看板的狀態
//   *_THINKING_LEVELS            推理強度與模型模式
//
// 只翻「通用形容詞」，模型與產品名一律保留英文（Claude、Sonnet、Cursor、
// Kimi、GitHub Copilot、GPT-5 Mini、Antigravity、VS Code、Amp 的 Smart／
// Rush、Cursor 的 Large／Deep 都不動）。
//
// 以 (id, label) 成對比對而非只看 id：同一個 id 在不同陣列裡可能是別的東西，
// 成對比對才能確定是我們認得的那一個。
const OPTION_LABELS = {
  'todo|Todo': '待處理',
  'in-progress|In progress': '進行中',
  'in-review|In review': '待審查',
  'completed|Done': '已完成',
  'low|Low': '低',
  'medium|Medium': '中',
  'high|High': '高',
  'xhigh|Extra High': '極高',
  'max|Max': '最大',
  'off|Off': '關',
  'on|On': '開',
  'auto|Auto': '自動',
  'default|Config default': '設定檔預設',
};

function patchOptionLabels(p, translateFn) {
  p.patch('選項清單標籤改走 i18n',
    c => c.includes('optionLabel.in-progress'),
    /\{(\s*)id: "([a-z0-9-]+)",(\s*)label: "([^"]{1,40})"/g,
    (m, s0, id, s1, label) => {
      const en = OPTION_LABELS[`${id}|${label}`];
      if (!en) return m;   // 不在白名單就整段不動
      return `{${s0}id: ${JSON.stringify(id)},${s1}get label() { `
        + `return ${translateFn}("optionLabel.${id}", ${JSON.stringify(label)}); }`;
    });
}

function patchNativeMenus(p) {
  p.patch('原生選單：為無 label 的 role 注入譯文',
    c => c.includes('nativeMenu.selectAll'),
    /\{\s*role:\s*"([A-Za-z]+)"\s*\}/g,
    (m, role) => MENU_ROLE_LABELS[role]
      ? `{ role: "${role}", label: ${t(role, MENU_ROLE_LABELS[role])} }`
      : m);

  p.patch('原生選單：Markdown 命令項改走 i18n',
    c => c.includes('nativeMenu.addLink'),
    /markdownCommandItem\("([^"]+)"/g,
    (m, label) => MENU_MD_ITEMS[label]
      ? `markdownCommandItem(${t(MENU_MD_ITEMS[label], label)}`
      : m);

  p.patch('原生選單：子選單標題改走 i18n',
    c => c.includes('nativeMenu.format'),
    /label:\s*"(Format|Paragraph|Insert)"/g,
    (m, label) => `label: ${t(MENU_SUBMENU_LABELS[label], label)}`);

  p.patch('原生選單：貼上項改走 i18n',
    c => c.includes('nativeMenu.pasteAsPlainText'),
    /editableContextPasteItem\("([^"]+)"/g,
    (m, label) => MENU_PASTE_ITEMS[label]
      ? `editableContextPasteItem(${t(MENU_PASTE_ITEMS[label], label)}`
      : m);
}

async function patch() {
  try {
    // dry-run 不寫檔，Orca 執行中也能安全跑，故不檢查
    if (!DRY_RUN && !FORCE) {
      const n = countRunningOrca();
      if (n > 0) {
        console.error(`❌ Orca 仍在執行中（偵測到 ${n} 個程序），已中止。\n`);
        console.error('   請先完全關閉 Orca：系統匣圖示右鍵 → Quit（不是只關閉視窗）。');
        console.error('   若在修補後才關閉，重新啟動的 Orca 可能出現「Unexpected token」');
        console.error('   造成側邊欄等面板顯示錯誤——那是舊 chunk 與新檔案不符所致。\n');
        if (platform === 'win32') {
          console.error('   確認是否關乾淨：');
          console.error('     Get-Process Orca,orca-terminal-daemon -ErrorAction SilentlyContinue\n');
        }
        console.error('   想在 Orca 執行中檢查相容性，請改用：npm run dry-run');
        console.error('   確定要強制繼續（不建議）：加上 --force');
        process.exitCode = 1;
        return;
      }
    }

    console.log('📦 1/6 正在解包 app.asar (這可能需要數十秒)...');
    if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(workDir, { recursive: true });
    asar.extractAll(orcaPath, unpackedDir);

    const mainFile = path.join(unpackedDir, 'out', 'main', 'index.js');
    if (!fs.existsSync(mainFile)) {
      throw new Error('找不到 out/main/index.js，Orca 可能已大幅更改架構！');
    }

    // 只在「目前的 asar 尚未被修補」時更新備份，
    // 否則重複執行會用已修補的版本覆蓋掉乾淨備份。
    const alreadyPatched = fs.readFileSync(mainFile, 'utf8').includes(MARK);
    const bakPath = orcaPath + '.bak';
    if (DRY_RUN) {
      console.log(`   ↳ [dry-run] 跳過備份。目前 app.asar ${alreadyPatched ? '已含' : '未含'}補丁。`);
    } else if (alreadyPatched && fs.existsSync(bakPath)) {
      console.log('   ↳ 偵測到目前 app.asar 已含補丁，保留既有的乾淨備份。');
    } else {
      fs.copyFileSync(orcaPath, bakPath);
      console.log('   ↳ 已備份原始 app.asar → app.asar.bak');
    }

    console.log('🛠️ 2/6 正在修補主程式 (main process) 語言限制...');
    const mp = createPatcher('main process', mainFile);
    mp.patch('注入 zh-TW 常數',
      c => c.includes(MARK),
      'const UI_LANGUAGE_CHINESE = "zh";',
      'const UI_LANGUAGE_CHINESE = "zh";\nconst UI_LANGUAGE_TRADITIONAL_CHINESE = "zh-TW";');
    mp.patch('加入語言列舉白名單',
      c => c.includes('UI_LANGUAGE_TRADITIONAL_CHINESE,'),
      'UI_LANGUAGE_CHINESE,\n  UI_LANGUAGE_KOREAN',
      'UI_LANGUAGE_CHINESE,\n  UI_LANGUAGE_TRADITIONAL_CHINESE,\n  UI_LANGUAGE_KOREAN');
    patchLocaleGate(mp);
    // main process 有自己的 LAZY_LOCALE_LOADERS（CJS require），需另外注入
    mp.patch('注入 main process 字典 loader',
      c => c.includes('"zh-TW": () => Promise.resolve()'),
      /(zh: \(\) => Promise\.resolve\(\)\.then\(\(\) => require\("\.\/chunks\/zh-[A-Za-z0-9_-]+\.js"\)\))/,
      '$1,\n  "zh-TW": () => Promise.resolve().then(() => require("./chunks/zh-TW-nested.js"))');
    patchNativeMenus(mp);
    mp.save();

    console.log('🛠️ 3/6 正在修補渲染器 (renderer process) 語言限制...');
    const assetsDir = path.join(unpackedDir, 'out', 'renderer', 'assets');
    const i18nFile = fs.readdirSync(assetsDir)
      .find(f => f.startsWith('I18nProvider-') && f.endsWith('.js'));
    if (!i18nFile) {
      throw new Error('找不到 I18nProvider 檔案，Orca 可能已大幅更改架構！');
    }
    const rendererFile = path.join(assetsDir, i18nFile);
    const rp = createPatcher('renderer', rendererFile);
    rp.patch('注入 zh-TW 常數',
      c => c.includes(MARK),
      'const UI_LANGUAGE_CHINESE = "zh";',
      'const UI_LANGUAGE_CHINESE = "zh";\nconst UI_LANGUAGE_TRADITIONAL_CHINESE = "zh-TW";');
    rp.patch('加入語言列舉白名單',
      c => c.includes('UI_LANGUAGE_TRADITIONAL_CHINESE,'),
      'UI_LANGUAGE_CHINESE,\n  UI_LANGUAGE_KOREAN',
      'UI_LANGUAGE_CHINESE,\n  UI_LANGUAGE_TRADITIONAL_CHINESE,\n  UI_LANGUAGE_KOREAN');
    rp.patch('加入語言下拉選單項目',
      c => c.includes('labelKey: "settings.appearance.language.traditionalChinese"'),
      '{ value: UI_LANGUAGE_CHINESE, labelKey: "settings.appearance.language.chinese" },',
      '{ value: UI_LANGUAGE_CHINESE, labelKey: "settings.appearance.language.chinese" },\n  { value: UI_LANGUAGE_TRADITIONAL_CHINESE, labelKey: "settings.appearance.language.traditionalChinese" },');
    rp.patch('加入語言名稱 fallback',
      c => c.includes('[UI_LANGUAGE_TRADITIONAL_CHINESE]:'),
      '[UI_LANGUAGE_CHINESE]: "中文（简体）",',
      '[UI_LANGUAGE_CHINESE]: "中文（简体）",\n  [UI_LANGUAGE_TRADITIONAL_CHINESE]: "中文（繁體）",');
    rp.patch('注入 renderer 字典 loader',
      c => c.includes('"zh-TW": () => __vitePreload'),
      /ko: \(\) => __vitePreload\(\(\) => import\("\.\/ko-[a-zA-Z0-9_-]+\.js"\), [^,]+, import\.meta\.url\),/,
      '$& \n  "zh-TW": () => __vitePreload(() => import("./zh-TW-nested.js"), true ? [] : void 0, import.meta.url),');
    patchLocaleGate(rp);
    // 「設定 → 快速鍵」顯示的是 renderer 這份定義，所以只改這裡。
    // main process 也有一份，但那份不用於顯示，動它只增加風險。
    patchKeybindingTitles(rp, 'translate');
    patchOptionLabels(rp, 'translate');
    rp.save();

    console.log('📂 4/6 正在植入繁體中文字典 (ESM + CJS 兩種格式)...');
    const esmDict = path.join(__dirname, 'zh-TW-nested.js');
    const cjsDict = path.join(__dirname, 'zh-TW-nested.cjs.js');
    for (const f of [esmDict, cjsDict]) {
      if (!fs.existsSync(f)) throw new Error(`找不到字典檔：${f}（請先執行 npm run build）`);
    }
    fs.copyFileSync(esmDict, path.join(assetsDir, 'zh-TW-nested.js'));
    const chunksDir = path.join(unpackedDir, 'out', 'main', 'chunks');
    fs.copyFileSync(cjsDict, path.join(chunksDir, 'zh-TW-nested.js'));

    console.log('🔎 5/6 正在驗證所有注入點...');
    const allFailed = [
      ...mp.failed.map(n => `[main] ${n}`),
      ...rp.failed.map(n => `[renderer] ${n}`),
    ];
    for (const p of [mp, rp]) {
      for (const n of p.ok) console.log(`   ✅ [${p.label}] ${n}`);
    }
    if (allFailed.length) {
      for (const n of allFailed) console.error(`   ❌ ${n}`);
      throw new Error(
        `有 ${allFailed.length} 個注入點失敗，已中止且未改動你的 Orca。\n` +
        '   這通常表示 Orca 更新後改了程式碼結構，需要更新本安裝包的錨點。'
      );
    }

    // 注入點都成功不代表改出來的檔案還能執行。原生選單那幾個補丁是用正則
    // 改寫 8MB 的 bundle，一旦括號配對出錯，Orca 會在啟動時整個掛掉而不是
    // 只有選單壞掉。所以重新封裝前先讓 Node 真的解析一遍。
    const { execFileSync } = require('child_process');
    // renderer 是 ES module（用了 import.meta.url），但副檔名是 .js，
    // node --check 會以 CommonJS 解析而誤判失敗。複製成 .mjs 再檢查。
    const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-zh-tw-check-'));
    try {
      for (const [label, file, ext] of [
        ['main process', mainFile, '.js'],
        ['renderer', rendererFile, '.mjs'],
      ]) {
        const probe = path.join(probeDir, 'probe' + ext);
        fs.copyFileSync(file, probe);
        try {
          execFileSync(process.execPath, ['--check', probe], { stdio: ['ignore', 'ignore', 'pipe'] });
          console.log(`   ✅ [${label}] 修補後的檔案通過 node --check`);
        } catch (e) {
          const msg = String(e.stderr || e.message)
            .split('\n').filter(l => !/^\(node:/.test(l) && !/trace-warnings/.test(l))
            .slice(0, 4).join('\n      ');
          throw new Error(
            `[${label}] 修補後的檔案語法無效，已中止且未改動你的 Orca：\n      ${msg}`
          );
        }
      }
    } finally {
      fs.rmSync(probeDir, { recursive: true, force: true });
    }

    if (DRY_RUN) {
      console.log('\n✅ [dry-run] 全部注入點驗證通過，未改動你的 Orca。');
      console.log('   關閉 Orca 後執行 npm start 即可正式套用。\n');
      fs.rmSync(workDir, { recursive: true, force: true });
      return;
    }

    console.log('🗜️ 6/6 正在重新打包 app.asar (這可能需要數十秒)...');
    await asar.createPackage(unpackedDir, orcaPath);
    fs.rmSync(workDir, { recursive: true, force: true });

    console.log('\n🎉 安裝成功！請完全關閉 Orca (系統匣右鍵 Quit) 並重新啟動！');
    console.log('然後前往 Settings -> Appearance -> Language 切換為「中文（繁體）」。\n');

  } catch (err) {
    console.error('\n❌ 安裝過程中發生錯誤：', err.message);
    console.error(`已保留原始備份：${orcaPath}.bak`);
    process.exitCode = 1;
  }
}

patch();

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

// 除錯用：允許以環境變數指定 Orca 路徑，方便在副本上重現問題而不影響正在用的 Orca
if (process.env.ORCA_PATH_OVERRIDE) orcaPath = process.env.ORCA_PATH_OVERRIDE;
const asar = require('@electron/asar');
// 判斷 app.asar 是否已含補丁的標記。--restore 也要用，故定義在旗標處理之前。
const MARK = 'UI_LANGUAGE_TRADITIONAL_CHINESE = "zh-TW"';
// --dry-run：解包、修補、驗證，但不備份也不重新打包。
// 可在 Orca 執行中安全使用，用來確認 Orca 更新後錨點是否仍然有效。
const DRY_RUN = process.argv.includes('--dry-run');
// --force：略過「Orca 是否執行中」的檢查。不建議使用，見 countRunningOrca 的說明。
const FORCE = process.argv.includes('--force');
// --minimal：只套用核心（語言切換＋字典），跳過全部加值本地化補丁。
// 加值補丁會改寫 Orca 的資料結構（把字面值換成 getter 或 translate 呼叫），
// 萬一某個 Orca 版本因此在 renderer 出問題，這個旗標可以立刻排除它們，
// 同時保留 11,000 多句的核心翻譯。
const MINIMAL = process.argv.includes('--minimal');
// --extras=a,b,c：只啟用指定的加值補丁分組，用來二分定位問題。
// 分組刻意照「改寫手法」而不是「功能」來切：getter 類會在 render 期間求值，
// 是最可能影響畫面的一種；translate 類只是把字面值換成函式呼叫，風險低得多。
//
//   menus        原生選單（main process，translate 呼叫）
//   keybindings  快速鍵名稱（renderer，getter）
//   labels       選項清單標籤（renderer，getter）
//   slash        Agent 斜線命令（index chunk，getter）
//   jsx          JSX 寫死字串（translate 呼叫）
//   onboarding   新手引導與功能提示（translate 呼叫）
//   varinfo      原始碼控制變數說明（translate 呼叫）
const EXTRAS_ARG = process.argv.find(a => a.startsWith('--extras='));
const EXTRAS = EXTRAS_ARG
  ? new Set(EXTRAS_ARG.slice('--extras='.length).split(',').map(x => x.trim()).filter(Boolean))
  : null;
// --full：啟用全部加值本地化。
const FULL = process.argv.includes('--full');
// --verbose：列出每一個注入點，而不是只印總數。
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// 預設套用全部加值本地化。
//
// 2.12.0 曾把預設關掉，因為加值補丁會造成白畫面。根因已在 2.13.0 找到並修正
// （patchVarInfo 在模組層直接呼叫 translate()，踩到 i18n 的暫時性死區），
// 且以實機啟動＋截圖比對驗證過，所以恢復預設全開。
// assertLazyTranslate() 會擋下同一類寫法再次出現。
const wantExtra = name => {
  if (MINIMAL) return false;
  if (EXTRAS) return EXTRAS.has(name);
  return true;
};

// --verify：檢查已安裝的 app.asar 是否含全部補丁與字典。
// 透過 npx 安裝的人沒有專案目錄，無法用 npm run verify，故在此提供同一個入口。
if (process.argv.includes('--verify')) {
  require('./scripts/verify-install.js');   // 該腳本會自行輸出結果並設定結束碼
  return;
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`用法： npx orca-zh-tw-installer [選項]

  （無選項）    套用完整繁體中文語系包。需先完全關閉 Orca。
  --dry-run    只檢查相容性，不改動 Orca。可在 Orca 執行中安全使用。
  --verify     檢查已安裝的 app.asar 是否含全部補丁與字典。
  --restore    還原成官方原版（從 app.asar.bak）。需先完全關閉 Orca。
  --extras=a,b 只啟用指定的加值分組（用來定位問題）。可用：
               menus, keybindings, labels, slash, jsx, onboarding, varinfo
  --verbose    列出每一個注入點（預設只印總數）。
  --minimal    只套用核心翻譯，跳過選單／快速鍵／引導等加值本地化。
  --force      即使 Orca 執行中也強制套用（不建議）。
  --help       顯示這段說明。
`);
  return;
}

// --restore：一鍵還原成官方原版。
//
// 原本 README 要使用者自己敲 Copy-Item／cp，那不但麻煩，還容易出兩種錯：
//   1. 在 Orca 執行中還原 → 跑著的 renderer 握著舊 chunk 檔名，會噴
//      「Unexpected token」，看起來像還原失敗
//   2. 備份其實已含補丁（例如某次安裝流程中斷）→ 還原後仍是中文，
//      使用者只會更困惑
// 所以這裡兩件都先檢查再動手。
if (process.argv.includes('--restore')) {
  const bak = orcaPath + '.bak';
  if (!fs.existsSync(bak)) {
    console.error(`❌ 找不到備份檔：${bak}\n`);
    console.error('   本安裝包只在首次套用時建立備份。若備份不存在，');
    console.error('   請重新安裝 Orca 以取得官方原版。');
    process.exitCode = 1;
    return;
  }

  // 注意條件是 !== 0 而不是 > 0。countRunningOrca() 回傳 -1 表示「無法判斷」
  // （tasklist 偶發失敗）。對「直接覆蓋 app.asar」這種破壞性操作，
  // 無法判斷時就必須擋下——我自己就踩過：測試時 tasklist 剛好失敗回 -1，
  // 守門放行，結果在 Orca 執行中把安裝好的語系包換回了官方版。
  const running = countRunningOrca();
  if (running !== 0 && !FORCE) {
    if (running < 0) {
      console.error('❌ 無法確認 Orca 是否在執行中，為安全起見已中止。\n');
      console.error('   請確認 Orca 已完全關閉，然後加上 --force 重試：');
      console.error('     npx orca-zh-tw-installer --restore --force');
    } else {
      console.error(`❌ Orca 仍在執行中（偵測到 ${running} 個程序），已中止。\n`);
      console.error('   請先完全關閉 Orca：系統匣圖示右鍵 → Quit（不是只關閉視窗）。');
      console.error('   在執行中替換 app.asar 會讓那個實例噴「Unexpected token」，');
      console.error('   看起來像還原失敗，其實只是需要重啟。');
    }
    process.exitCode = 1;
    return;
  }

  // 備份本身必須是乾淨的，否則還原了也還是中文
  let bakIsClean = true;
  try {
    bakIsClean = !asar.extractFile(bak, path.join('out', 'main', 'index.js'))
      .toString('utf8').includes(MARK);
  } catch (e) {
    console.error(`❌ 無法讀取備份檔內容：${e.message}`);
    console.error('   備份可能已損毀，請重新安裝 Orca。');
    process.exitCode = 1;
    return;
  }
  if (!bakIsClean) {
    console.error('❌ 備份檔本身已含繁中補丁，還原它不會回到官方原版。\n');
    console.error('   這通常表示某次安裝流程中斷，導致備份被覆蓋。');
    console.error('   請重新安裝 Orca 以取得官方原版。');
    process.exitCode = 1;
    return;
  }

  const sizeMb = n => (fs.statSync(n).size / 1048576).toFixed(1);
  console.log(`🔄 正在還原官方原版...`);
  console.log(`   目前：app.asar        ${sizeMb(orcaPath)} MB`);
  console.log(`   備份：app.asar.bak    ${sizeMb(bak)} MB（已確認為乾淨版本）`);
  fs.copyFileSync(bak, orcaPath);
  console.log('\n✅ 已還原成官方原版。重新啟動 Orca 後介面會回到英文。');
  console.log('   備份檔保留未刪，之後想再套用繁中直接執行 npx orca-zh-tw-installer。');
  return;
}
const workDir = path.join(os.tmpdir(), DRY_RUN ? 'orca-zh-tw-patcher-dry' : 'orca-zh-tw-patcher');
const unpackedDir = path.join(workDir, 'app.asar.unpacked');


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
 * 擋下「在物件字面值裡直接呼叫 translate()」這種寫法。
 *
 * renderer chunk 裡的 translate() 內部會讀 `const i18n`，而那個宣告在檔案很後面
 * （SOURCE_CONTROL_ACTION_VARIABLE_INFO 之後約 62 萬字元）。把
 *
 *     description: translate("k", "English")
 *
 * 塞進模組層的物件字面值，模組一載入求值到那行就踩進暫時性死區，拋
 * ReferenceError: Cannot access 'i18n' before initialization。
 * 那是模組頂層，React 的 error boundary 接不到，整包 renderer 求值失敗——
 * 使用者看到的是全白視窗，而所有靜態檢查（node --check、錨點命中數、
 * 字典載入測試）全都會通過。2.9.0～2.12.0 的白畫面就是這樣來的。
 *
 * 正確寫法是包成 getter，把求值延到真的有人讀這個屬性時：
 *
 *     get description() { return translate("k", "English"); }
 *
 * 這個檢查只認語法形狀，不管補丁是誰寫的——因為當初就是「三個補丁函式各寫各的，
 * 其中一個漏掉 getter」才出事。
 */
function assertLazyTranslate(repl, where, renderScoped) {
  if (typeof repl !== 'string') return;
  // renderScoped：呼叫端已確認這個位置在元件函式／render 樹內，
  // 求值時機必定晚於 i18n 初始化。這個豁免要附證據，不接受「應該沒事」。
  if (renderScoped) return;
  const m = repl.match(/^\s*(\w+)\s*:\s*(translate|t)\s*\(/);
  if (m) {
    throw new Error(
      `補丁寫法不安全（${where}）：\n` +
      `  ${repl.slice(0, 90)}\n` +
      `  物件屬性不可直接呼叫 ${m[2]}()，模組載入時 i18n 尚未初始化會導致白畫面。\n` +
      `  請改成：get ${m[1]}() { return ${m[2]}(...); }`);
  }
}

/**
 * 修補器：每個修補都要宣告「如何判斷已完成」。
 * 若錨點找不到且尚未完成，就記為失敗——絕不靜默略過。
 */
function createPatcher(label, filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  const ok = [];
  const failed = [];
  const warned = [];
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
    /**
     * 加值型修補：錨點找不到只警告，不讓整個安裝失敗。
     *
     * 語言切換與字典注入是核心，錨點壞了就必須中止——否則使用者會裝到一個
     * 「看起來成功但沒效果」的語系包。但原生選單、快速鍵名稱、斜線命令說明
     * 這些是額外的本地化，Orca 改了結構時頂多那部分維持英文，
     * 不該連帶讓整包裝不起來。
     */
    patchOptional(name, done, find, repl) {
      if (done(code)) { ok.push(`${name}（已存在）`); return; }
      const before = code;
      code = code.replace(find, repl);
      if (code === before || !done(code)) warned.push(name);
      else ok.push(name);
    },
    /**
     * 批次加值型修補：一次套用多筆取代，只回報一行摘要。
     *
     * 引導文案、變數說明這類是「同一件事的很多句」，逐句各印一行會讓安裝
     * 輸出多出 95 行，把真正該注意的訊息淹掉。改成回報 66/66 這種比例，
     * 沒全中時才列出前幾筆沒對上的，方便追。
     *
     * @param items [{ done, find, repl, label }]
     */
    patchBatch(name, items) {
      let hit = 0;
      const miss = [];
      for (const it of items) {
        assertLazyTranslate(it.repl, `${label} / ${name} / ${it.label}`, it.renderScoped);
        if (it.done(code)) { hit++; continue; }
        const before = code;
        code = code.replace(it.find, it.repl);
        if (code === before || !it.done(code)) miss.push(it.label);
        else hit++;
      }
      const total = items.length;
      if (!miss.length) { ok.push(`${name}（${hit}/${total}）`); return; }
      warned.push(`${name}（${hit}/${total}，未對上：${miss.slice(0, 3).join('、')}${miss.length > 3 ? ` 等 ${miss.length} 筆` : ''}）`);
    },
    save() { fs.writeFileSync(filePath, code); },
    get ok() { return ok; },
    get failed() { return failed; },
    get warned() { return warned; },
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
  p.patchOptional('快速鍵名稱與群組改走 i18n',
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
  p.patchOptional('選項清單標籤改走 i18n',
    c => c.includes('optionLabel.in-progress'),
    /\{(\s*)id: "([a-z0-9-]+)",(\s*)label: "([^"]{1,40})"/g,
    (m, s0, id, s1, label) => {
      const en = OPTION_LABELS[`${id}|${label}`];
      if (!en) return m;   // 不在白名單就整段不動
      return `{${s0}id: ${JSON.stringify(id)},${s1}get label() { `
        + `return ${translateFn}("optionLabel.${id}", ${JSON.stringify(label)}); }`;
    });
}

// ── Agent 斜線命令說明本地化 ───────────────────────────────────────────
// 在 Agent composer 輸入 / 時列出的命令清單，description 是 Orca 自己寫的
// 說明文字，寫死在 COMMON_COMMANDS／CLAUDE_COMMANDS／CODEX_COMMANDS 裡。
// name 是真的要送給 CLI 的命令，絕對不能動。
//
// 鍵用英文原文的 slug 而不是命令名：/clear、/compact、/init 在不同 agent
// 有不同說明（Claude 的 /clear 是「Clear conversation history」，
// Codex 的是「Clear the terminal and start a new chat」），
// 用命令名當鍵會撞在一起。
const slashKey = en => 'slashCommand.' + en
  .replace(/[^A-Za-z0-9 ]/g, '')
  .split(/\s+/)
  .filter(Boolean)
  .map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())
  .join('');

function patchSlashCommands(p, translateFn) {
  p.patchOptional('Agent 斜線命令說明改走 i18n',
    c => c.includes('slashCommand.'),
    /\{(\s*)name: "([a-z][a-z0-9:-]*)",(\s*)description: "((?:[^"\\]|\\.){2,80})"(\s*)\}/g,
    (m, s0, name, s1, en, s2) =>
      `{${s0}name: ${JSON.stringify(name)},${s1}get description() { `
      + `return ${translateFn}(${JSON.stringify(slashKey(en))}, ${JSON.stringify(en)}); }${s2}}`);
}

// ── JSX 屬性裡寫死的字串 ───────────────────────────────────────────────
// 使用者回報原始碼控制的空狀態是英文：
//
//   jsx(EmptyState, {
//     heading: "No changes on this branch",
//     supportingText: `This workspace is clean and this branch has no changes ahead of ${…}`
//   })
//
// 這暴露了先前掃描的盲點——我只找雙引號字面值，反引號模板字串整類漏掉。
//
// 模板字串含插值，改寫時要把 ${expr} 轉成 i18next 的 {{name}} 佔位符，
// 並把原本的運算式搬到第三個參數。因為每處的運算式都不同，只能用
// 「完整字面值完全相符」逐句取代，不能用正則。
const JSX_HARDCODED = [
  // ── 原始碼控制空狀態（使用者回報的那一處）──
  ['SourceControl', 'heading: "No changes on this branch"',
    'heading: translate("sourceControl.noChangesHeading", "No changes on this branch")'],
  ['SourceControl',
    'supportingText: `This workspace is clean and this branch has no changes ahead of ${branchSummary?.baseRef ?? "base"}`',
    'supportingText: translate("sourceControl.noChangesDetail", '
    + '"This workspace is clean and this branch has no changes ahead of {{base}}", '
    + '{ base: branchSummary?.baseRef ?? "base" })'],
  ['SourceControl', 'heading: "No matching files"',
    'heading: translate("sourceControl.noMatchingFilesHeading", "No matching files")'],
  ['SourceControl', 'supportingText: `No changed files match "${filterQuery}"`',
    'supportingText: translate("sourceControl.noChangedFilesMatch", '
    + '"No changed files match \\"{{query}}\\"", { query: filterQuery })'],
  ['SourceControl', '"Operation in progress…"',
    'translate("sourceControl.operationInProgress", "Operation in progress…")'],
  ['SourceControl', '`Abort the ${conflictOperation} in progress`',
    'translate("sourceControl.abortConflictOperation", "Abort the {{operation}} in progress", '
    + '{ operation: conflictOperation })'],
  ['SourceControl', 'confirmLabel: `Abort ${label}`',
    'confirmLabel: translate("sourceControl.abortConfirm", "Abort {{label}}", { label })'],

  // ── 自動化排程描述。同一句英文出現兩次，插值運算式不同，故分開列 ──
  ['AutomationsPage', '`Hourly at :${String(schedule.minute).padStart(2, "0")}`',
    'translate("automation.scheduleHourly", "Hourly at :{{minute}}", '
    + '{ minute: String(schedule.minute).padStart(2, "0") })'],
  ['AutomationsPage', '`Hourly at :${String(minute).padStart(2, "0")}`',
    'translate("automation.scheduleHourly", "Hourly at :{{minute}}", '
    + '{ minute: String(minute).padStart(2, "0") })'],
  ['AutomationsPage', '`Daily at ${time}`',
    'translate("automation.scheduleDaily", "Daily at {{time}}", { time })'],
  ['AutomationsPage', '`Weekdays at ${time}`',
    'translate("automation.scheduleWeekdays", "Weekdays at {{time}}", { time })'],

  // ── 新增 Agent 分頁的標題 ──
  ['I18nProvider', '`New ${TUI_AGENT_DISPLAY_NAMES[agent]} tab`',
    'translate("tab.newAgentTab", "New {{agent}} tab", { agent: TUI_AGENT_DISPLAY_NAMES[agent] })'],
];

function patchJsxHardcoded(p, chunkTag) {
  const items = JSX_HARDCODED.filter(x => x[0] === chunkTag);
  if (!items.length) return;
  p.patchBatch('JSX 寫死字串改走 i18n', items.map(([, find, repl]) => ({
    done: c => c.includes(repl),
    find,
    repl,
    // 這些全部落在 jsxRuntimeExports.jsx(Component, { ... }) 的 render 樹裡，
    // 已逐一在乾淨檔比對過前後文確認；多數還引用 branchSummary、filterQuery、
    // label 這類區域變數，本身就證明了它在元件函式內。求值時 i18n 必定已就緒。
    renderScoped: true,
    label: find.replace(/^[a-zA-Z]+:\s*/, '').slice(0, 20).replace(/\s+/g, ' '),
  })));
}


// ── 新手引導／功能提示本地化 ───────────────────────────────────────────
// FEATURE_TIPS、CONTEXTUAL_TOURS、FEATURE_WALL_SETUP_STEPS 三個陣列裡的
// title／body／description／eyebrow／ctaLabel／name／subtitle 全是寫死的英文，
// 完全沒有經過 translate()——語系檔裡根本沒有這些鍵。
//
// 兩個標記必須原樣保留：
//   <shortcut>              會被換成平台正確的 <kbd> 按鍵元素
//   {terminal.splitRight}   快速鍵參照，渲染時換成實際按鍵
//
const ONBOARDING_STRINGS = [
  ["I18nProvider", "title", "Let agents drive Orca with the Orca CLI"],
  ["I18nProvider", "title", "Jump to a worktree with <shortcut>"],
  ["I18nProvider", "title", "Voice Dictation is here"],
  ["I18nProvider", "title", "Plan work on the board"],
  ["I18nProvider", "title", "Move work through lanes"],
  ["I18nProvider", "title", "Split a terminal pane"],
  ["I18nProvider", "title", "Start another task in parallel"],
  ["I18nProvider", "title", "Grab page context for agents"],
  ["I18nProvider", "title", "Mark design feedback in place"],
  ["I18nProvider", "title", "Stay logged in"],
  ["I18nProvider", "title", "Choose the work source"],
  ["I18nProvider", "title", "Filter to the work you need"],
  ["I18nProvider", "title", "Start from work items"],
  ["I18nProvider", "title", "What is an automation?"],
  ["I18nProvider", "title", "Find the results"],
  ["I18nProvider", "title", "Run an agent across every repo"],
  ["I18nProvider", "title", "Or use it as a scratchpad"],
  ["I18nProvider", "title", "Pick a project"],
  ["I18nProvider", "title", "Name it, or start from existing work"],
  ["I18nProvider", "title", "Choose what agent starts the work"],
  ["I18nProvider", "body", "Use the board when you want to see workspaces by status instead of by project."],
  ["I18nProvider", "body", "Drag workspaces between lanes as their status changes."],
  ["I18nProvider", "body", "Open a second terminal pane with {terminal.splitRight}, or right-click the pane for split options."],
  ["I18nProvider", "body", "Each worktree gets its own branch, so parallel work stays separate."],
  ["I18nProvider", "body", "Use the grab tool to copy a page element's context for agents."],
  ["I18nProvider", "body", "Annotate elements and send those notes to an agent."],
  ["I18nProvider", "body", "Bring your existing logins into Orca to stay signed in immediately."],
  ["I18nProvider", "body", "Switch between connected providers and project filters without changing pages."],
  ["I18nProvider", "body", "Use presets and search to narrow issues, reviews, merge requests, or tasks."],
  ["I18nProvider", "body", "Use Start or Open on a task, issue, review, or merge request to bring its context into a workspace."],
  ["I18nProvider", "body", "Automations run agent work on a schedule. Add an automation by clicking this button."],
  ["I18nProvider", "body", "Runs show when automations executed, what happened, and where to inspect their output."],
  ["I18nProvider", "body", "Agents here run in any folder you choose. Point one at the directory above your services to work across all your repos at once."],
  ["I18nProvider", "body", "Open agents, scratch terminals, notes, and browser tabs without cluttering the worktree you’re focused on."],
  ["I18nProvider", "body", "Orca isolates each task in its own worktree, branched off your base."],
  ["I18nProvider", "body", "Start from a linked task for a short issue or PR name. Or leave it blank to auto-name it from your first agent message."],
  ["I18nProvider", "body", "Pick the agent that should be opened when this worktree is created."],
  ["I18nProvider", "description", "Enable agents to coordinate child worktrees and communicate between worktrees."],
  ["I18nProvider", "description", "Search worktrees, switch tabs, tweak settings, or spin up a new worktree, all without leaving the keyboard."],
  ["I18nProvider", "description", "Speak into any focused pane and Orca will transcribe it. Press the dictation shortcut to start and stop."],
  ["I18nProvider", "ctaLabel", "Install CLI & Skills"],
  ["I18nProvider", "ctaLabel", "Got it"],
  ["I18nProvider", "ctaLabel", "Set Up Voice"],
  ["I18nProvider", "label", "Split terminal"],
  ["index", "description", "Work in 2 different worktrees at once. Each one is isolated (even in the same project). Perfect for working on 2 features at once."],
  ["index", "description", "Browse your web app without leaving Orca. Grab any element and send its exact source and styles to an agent with one click."],
  ["index", "description", "Know the moment an agent finishes, needs attention, or gets blocked."],
  ["index", "description", "Start new work faster with your preferred agent already selected."],
  ["index", "description", "Register the Orca shell command and install agent skills for browser, computer, and orchestration workflows."],
  ["index", "description", "Start an agent from a task in one click and keep PR status in view."],
  ["index", "description", "Run install and setup commands automatically so every new worktree is ready for agents."],
  ["index", "description", "Bring your key repos into Orca so you can start agent work without hunting for folders."],
  ["index", "name", "Use Orca's browser"],
  ["index", "name", "Turn on notifications"],
  ["index", "name", "Choose your default agent"],
  ["index", "name", "Enable Orca CLI"],
  ["index", "name", "Connect integrations"],
  ["index", "name", "Automate workspace setup"],
  ["index", "name", "Start work in multiple repos"],
  ["index", "subtitle", "Use Orca's browser"],
  ["index", "subtitle", "Turn on notifications"],
  ["index", "subtitle", "Choose your default agent"],
  ["index", "subtitle", "Enable Orca CLI"],
  ["index", "subtitle", "Connect integrations"],
  ["index", "subtitle", "Automate workspace setup"],
  ["index", "subtitle", "Start work in multiple repos"],
];

// 每個 (欄位, 英文) 組合逐一取代。用全域正則而非字串，因為同一句可能出現多次
// （name 與 subtitle 常是同一個值，eyebrow: "Tip" 出現三次）。
function patchOnboarding(p, chunkTag, translateFn) {
  const slug = en => en.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 6)
    .map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
  // 用具名替換而非 '\\$&'——$& 在字串替換裡是「匹配到的內容」，
  // 之前用產生器寫入這行時被外層 replace 吃掉，導致 esc 產生垃圾。
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, m => '\\' + m);
  const items = [];
  for (const [tag, field, en] of ONBOARDING_STRINGS) {
    if (tag !== chunkTag) continue;
    // 同 patchVarInfo：一律用 getter 延後求值。
    // 這些引導字串目前是在函式內建立的物件，直接呼叫剛好沒事——但那是運氣，
    // Orca 哪天把它提到模組層就會變成白畫面，而且靜態檢查抓不到。
    // getter 在兩種情境都安全，沒有理由不用。
    const repl = `get ${field}() { return ${translateFn}("onboarding.${slug(en)}", ${JSON.stringify(en)}); }`;
    items.push({
      done: c => c.includes(repl),
      find: new RegExp(`${field}: "${esc(en)}"`, 'g'),
      repl,
      label: en.slice(0, 20),
    });
  }
  if (items.length) p.patchBatch('新手引導與功能提示改走 i18n', items);
}


// ── 原始碼控制 AI 動作的變數說明 ─────────────────────────────────────
// SOURCE_CONTROL_ACTION_VARIABLE_INFO 描述 {branch}、{stagedPatch} 這些
// 可在自訂提示詞裡使用的變數。description 是 Orca 自己的說明文字，
// 全部寫死沒有進 i18n。
//
// example 只翻敘述性的那幾句；git diff、分支名、檔案清單這類技術範例
// 保持原樣——那是要讓使用者認出實際資料長什麼樣。
const VARINFO_STRINGS = [
  ["description", "Orca’s built-in prompt for this action, including the context Orca knows how to gather safely."],
  ["example", "Commit messages include staged diff guidance; PR details include branch comparison guidance; fix actions include the failure summary."],
  ["description", "The current source-control branch name."],
  ["description", "A newline-separated list of staged files for commit-message generation."],
  ["description", "The staged git patch used for commit-message generation."],
  ["description", "The target branch selected in the Create PR composer."],
  ["description", "The PR title currently typed in the composer before generation starts."],
  ["example", "Improve Source Control AI customization"],
  ["description", "The PR description currently typed in the composer before generation starts."],
  ["example", "Adds configurable agents and command templates for Source Control actions."],
  ["description", "A newline-separated list of commits on the branch compared to the base."],
  ["description", "A summary of files changed between the branch and the base branch."],
  ["description", "The branch diff against the base branch used for PR-details generation."],
  ["description", "The first user request that created the Orca workspace."],
  ["example", "Fix CI and commit the result"],
  ["description", "The initial agent response, when Orca has one available."],
  ["example", "I will inspect the failing check, patch the issue, and run tests."],
];

function patchVarInfo(p, translateFn) {
  const slug = en => en.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 6)
    .map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, m => '\\' + m);
  // 必須用 getter，不能直接寫成 `field: translate(...)`。
  //
  // 這些字串在 SOURCE_CONTROL_ACTION_VARIABLE_INFO 這個模組層的 const 物件裡，
  // 位置比 renderer chunk 裡的 `const i18n = ...` 早了約 62 萬字元。
  // translate() 內部讀 i18n，而 i18n 是 const——模組一載入求值到這裡就會踩進
  // 暫時性死區，拋 ReferenceError: Cannot access 'i18n' before initialization。
  // 那是在模組頂層，沒有 error boundary 接得住，整包 renderer 求值失敗，
  // 使用者看到的就是全白的視窗。
  //
  // 包成 getter 之後求值時機延到真的有人讀這個屬性時，那時 i18n 早就就緒了。
  // 這也是 keybindings／labels／slash 一開始就用 getter 的原因，
  // 只有這組當初漏掉——它們是三個獨立的補丁函式，沒有共用同一條規則。
  const items = VARINFO_STRINGS.map(([field, en]) => {
    const repl = `get ${field}() { return ${translateFn}("scVariable.${slug(en)}", ${JSON.stringify(en)}); }`;
    return {
      done: c => c.includes(repl),
      find: new RegExp(`${field}: "${esc(en)}"`, 'g'),
      repl,
      label: en.slice(0, 20),
    };
  });
  p.patchBatch('原始碼控制變數說明改走 i18n', items);
}

function patchNativeMenus(p) {
  p.patchOptional('原生選單：為無 label 的 role 注入譯文',
    c => c.includes('nativeMenu.selectAll'),
    /\{\s*role:\s*"([A-Za-z]+)"\s*\}/g,
    (m, role) => MENU_ROLE_LABELS[role]
      ? `{ role: "${role}", label: ${t(role, MENU_ROLE_LABELS[role])} }`
      : m);

  p.patchOptional('原生選單：Markdown 命令項改走 i18n',
    c => c.includes('nativeMenu.addLink'),
    /markdownCommandItem\("([^"]+)"/g,
    (m, label) => MENU_MD_ITEMS[label]
      ? `markdownCommandItem(${t(MENU_MD_ITEMS[label], label)}`
      : m);

  p.patchOptional('原生選單：子選單標題改走 i18n',
    c => c.includes('nativeMenu.format'),
    /label:\s*"(Format|Paragraph|Insert)"/g,
    (m, label) => `label: ${t(MENU_SUBMENU_LABELS[label], label)}`);

  p.patchOptional('原生選單：貼上項改走 i18n',
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
      // 同 --restore：-1 是「無法判斷」，破壞性操作必須擋下而非放行。
      const n = countRunningOrca();
      if (n < 0) {
        console.error('❌ 無法確認 Orca 是否在執行中，為安全起見已中止。\n');
        console.error('   請確認 Orca 已完全關閉，然後加上 --force 重試。');
        console.error('   想在 Orca 執行中檢查相容性，請改用：npm run dry-run');
        process.exitCode = 1;
        return;
      }
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

    // 有乾淨備份就從備份解包，不要從目前的 app.asar。
    //
    // 從現況解包會讓安裝變成不可重入：補丁的錨點是原始英文字面值
    // （例如 title: "Plan work on the board"），一旦上一版已經把它換成
    // title: translate(...)，新版要找的錨點就不存在了。
    // 結果是新的修正套不進去、舊的壞寫法原封不動留著，而畫面上只會多幾行
    // 「未對上」的警告——安裝仍然回報成功。
    //
    // 使用者的筆電就是這樣：裝了含白畫面 bug 的舊版，再裝修正版也救不回來，
    // 因為修正需要的錨點已經被舊版吃掉了。必須先 --restore 才行。
    // 那不該是使用者要知道的事，所以改成一律從乾淨來源重建。
    const bakPath = orcaPath + '.bak';
    const isClean = f => {
      try {
        return !asar.extractFile(f, path.join('out', 'main', 'index.js'))
          .toString('utf8').includes(MARK);
      } catch { return false; }
    };
    const bakUsable = fs.existsSync(bakPath) && isClean(bakPath);
    const currentClean = isClean(orcaPath);

    if (!bakUsable && !currentClean) {
      // 現況已修補，又沒有可用的乾淨備份——沒有任何來源能拿到原始碼。
      // 硬著頭皮套下去只會得到一個補丁半舊半新的 asar，那比裝不起來更糟。
      console.error('❌ 找不到乾淨的原始 app.asar，已中止（未改動任何檔案）。\n');
      console.error('   目前的 app.asar 已含補丁，而 app.asar.bak 不存在或同樣含補丁。');
      console.error('   補丁必須套在原始碼上，混著套會產生半舊半新的檔案。\n');
      console.error('   請重新安裝 Orca 取得原始檔案，再執行本安裝包。');
      process.exitCode = 1;
      return;
    }

    // extractAll 會去 `<檔名>.unpacked/` 取那些沒有打包進 asar 的原生模組，
    // 所以不能直接對 app.asar.bak 解包——它會去找 app.asar.bak.unpacked，
    // 那個目錄不存在，整個解包就會失敗（Unable to extract some files）。
    // 把備份擺進暫存目錄改名成 app.asar，旁邊用 junction 指回真正的 unpacked。
    let extractFrom = orcaPath;
    if (bakUsable) {
      const stageDir = path.join(workDir, 'stage');
      fs.mkdirSync(stageDir, { recursive: true });
      extractFrom = path.join(stageDir, 'app.asar');
      fs.copyFileSync(bakPath, extractFrom);
      const unpackedSrc = orcaPath + '.unpacked';
      if (fs.existsSync(unpackedSrc)) {
        const link = extractFrom + '.unpacked';
        // junction 在 Windows 上不需要管理員權限；POSIX 會自動當成目錄符號連結。
        // 萬一系統擋掉（例如某些受限環境），退而求其次整份複製。
        try { fs.symlinkSync(unpackedSrc, link, 'junction'); }
        catch { fs.cpSync(unpackedSrc, link, { recursive: true }); }
      }
    }
    asar.extractAll(extractFrom, unpackedDir);
    if (bakUsable && !currentClean) {
      console.log('   ↳ 從乾淨備份解包（目前 app.asar 已含舊補丁，重建以確保完整套用）');
    }

    const mainFile = path.join(unpackedDir, 'out', 'main', 'index.js');
    if (!fs.existsSync(mainFile)) {
      throw new Error('找不到 out/main/index.js，Orca 可能已大幅更改架構！');
    }

    // 只在「目前的 asar 尚未被修補」時更新備份，
    // 否則重複執行會用已修補的版本覆蓋掉乾淨備份。
    if (DRY_RUN) {
      console.log(`   ↳ [dry-run] 跳過備份。目前 app.asar ${currentClean ? '未含' : '已含'}補丁。`);
    } else if (!currentClean) {
      console.log('   ↳ 保留既有的乾淨備份。');
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
    if (wantExtra('menus')) patchNativeMenus(mp);
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
    if (wantExtra('keybindings')) patchKeybindingTitles(rp, 'translate');
    if (wantExtra('labels')) patchOptionLabels(rp, 'translate');
    if (wantExtra('jsx')) patchJsxHardcoded(rp, 'I18nProvider');
    if (wantExtra('onboarding')) patchOnboarding(rp, 'I18nProvider', 'translate');
    rp.save();

    // Agent 斜線命令的說明在另一個 chunk。檔名帶 hash（index-DlEnJ7xL.js），
    // 每次 Orca 建置都會變，所以靠內容找而不是靠檔名。
    // 那個 chunk 有 import { t as translate }，模組層可直接呼叫。
    const slashFile = (wantExtra('slash') || wantExtra('onboarding')) ? fs.readdirSync(assetsDir)
      .filter(f => f.endsWith('.js'))
      .map(f => path.join(assetsDir, f))
      .find(f => {
        try { return fs.readFileSync(f, 'utf8').includes('CODEX_COMMANDS'); } catch { return false; }
      }) : null;
    let sp = null;
    if (slashFile) {
      sp = createPatcher('slash commands', slashFile);
      if (wantExtra('slash')) patchSlashCommands(sp, 'translate');
      if (wantExtra('onboarding')) patchOnboarding(sp, 'index', 'translate');
      sp.save();
    } else {
      console.log('   ⚠️ 找不到含 CODEX_COMMANDS 的 chunk，斜線命令說明將維持英文。');
    }

    // 原始碼控制 AI 動作的變數說明原本內嵌在 I18nProvider chunk，
    // Orca 把「Source Control AI recipe」功能拆成獨立的 lazy chunk 後，
    // SOURCE_CONTROL_ACTION_VARIABLE_INFO 也跟著搬過去了（檔名帶 hash，
    // 靠內容找）。這個 chunk 是 import { t as translate } 進來的，
    // translate 本身在別的 chunk 已初始化完畢，沒有 rp 那份的 TDZ 疑慮，
    // 但沿用 getter 寫法維持一致，反正 assertLazyTranslate 也認這個形狀。
    let vp = null;
    let varInfoFile = null;
    if (wantExtra('varinfo')) {
      varInfoFile = fs.readdirSync(assetsDir)
        .filter(f => f.endsWith('.js'))
        .map(f => path.join(assetsDir, f))
        .find(f => {
          try { return fs.readFileSync(f, 'utf8').includes('SOURCE_CONTROL_ACTION_VARIABLE_INFO'); } catch { return false; }
        });
      if (varInfoFile) {
        vp = createPatcher('source control 變數說明', varInfoFile);
        patchVarInfo(vp, 'translate');
        vp.save();
      } else {
        console.log('   ⚠️ 找不到含 SOURCE_CONTROL_ACTION_VARIABLE_INFO 的 chunk，變數說明將維持英文。');
      }
    }

    // 原始碼控制空狀態與自動化排程描述各在自己的 chunk。
    // 同樣靠內容找（檔名帶 hash），找不到就警告並繼續。
    const extraPatchers = [];
    for (const [tag, marker] of (wantExtra('jsx') ? [
      ['SourceControl', 'No changes on this branch'],
      ['AutomationsPage', 'Weekdays at '],
    ] : [])) {
      const file = fs.readdirSync(assetsDir)
        .filter(f => f.endsWith('.js') && f.startsWith(tag))
        .map(f => path.join(assetsDir, f))
        .find(f => {
          try { return fs.readFileSync(f, 'utf8').includes(marker); } catch { return false; }
        });
      if (!file) {
        console.log(`   ⚠️ 找不到 ${tag} chunk，該部分字串將維持英文。`);
        continue;
      }
      const xp = createPatcher(tag, file);
      patchJsxHardcoded(xp, tag);
      xp.save();
      extraPatchers.push({ p: xp, file });
    }

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
    const patchers = [mp, rp, ...(sp ? [sp] : []), ...(vp ? [vp] : []), ...extraPatchers.map(x => x.p)];
    const allFailed = patchers.flatMap(p => p.failed.map(n => `[${p.label}] ${n}`));
    const allWarned = patchers.flatMap(p => p.warned.map(n => `[${p.label}] ${n}`));
    // 逐條列出注入點對安裝者沒有意義——他要的是「成了沒」。
    // 有東西沒對上時才需要細節，那時列出來才幫得上忙。
    // 想看完整清單：--verbose，或用 --dry-run（診斷模式本來就該話多）。
    const okCount = patchers.reduce((n, p) => n + p.ok.length, 0);
    if (VERBOSE || DRY_RUN || allFailed.length || allWarned.length) {
      for (const p of patchers) {
        for (const n of p.ok) console.log(`   ✅ [${p.label}] ${n}`);
      }
    } else {
      console.log(`   ✅ ${okCount} 個注入點全數套用（--verbose 可看細項）`);
    }
    // 加值型修補失敗只警告——那部分維持英文，但語言切換與字典照樣生效。
    for (const n of allWarned) {
      console.log(`   ⚠️ ${n}（錨點已變，該部分維持英文，其餘不受影響）`);
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
      const toCheck = [
        ['main process', mainFile, '.js'],
        ['renderer', rendererFile, '.mjs'],
      ];
      if (slashFile) toCheck.push(['slash commands', slashFile, '.mjs']);
      if (vp) toCheck.push([vp.label, varInfoFile, '.mjs']);
      for (const x of extraPatchers) toCheck.push([x.p.label, x.file, '.mjs']);
      for (const [label, file, ext] of toCheck) {
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

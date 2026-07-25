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

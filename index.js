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
const workDir = path.join(os.tmpdir(), 'orca-zh-tw-patcher');
const unpackedDir = path.join(workDir, 'app.asar.unpacked');

async function patch() {
  try {
    console.log('📦 1/5 正在備份官方 app.asar 並解包 (這可能需要數十秒)...');
    fs.copyFileSync(orcaPath, orcaPath + '.bak');
    
    if (fs.existsSync(workDir)) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
    fs.mkdirSync(workDir, { recursive: true });
    
    asar.extractAll(orcaPath, unpackedDir);

    console.log('🛠️ 2/5 正在破解主程式 (main process) 語言限制...');
    const mainFile = path.join(unpackedDir, 'out', 'main', 'index.js');
    let mainCode = fs.readFileSync(mainFile, 'utf8');
    
    // 注入常數
    if (!mainCode.includes('UI_LANGUAGE_TRADITIONAL_CHINESE = "zh-TW"')) {
      mainCode = mainCode.replace(
        'const UI_LANGUAGE_CHINESE = "zh";',
        'const UI_LANGUAGE_CHINESE = "zh";\nconst UI_LANGUAGE_TRADITIONAL_CHINESE = "zh-TW";'
      );
    }
    // 注入白名單
    if (mainCode.includes('UI_LANGUAGE_CHINESE') && !mainCode.includes('UI_LANGUAGE_TRADITIONAL_CHINESE,')) {
      mainCode = mainCode.replace(
        'UI_LANGUAGE_CHINESE,\n  UI_LANGUAGE_KOREAN',
        'UI_LANGUAGE_CHINESE,\n  UI_LANGUAGE_TRADITIONAL_CHINESE,\n  UI_LANGUAGE_KOREAN'
      );
    }
    fs.writeFileSync(mainFile, mainCode);

    console.log('🛠️ 3/5 正在破解渲染器 (renderer process) 語言限制...');
    const assetsDir = path.join(unpackedDir, 'out', 'renderer', 'assets');
    const files = fs.readdirSync(assetsDir);
    const i18nFile = files.find(f => f.startsWith('I18nProvider-') && f.endsWith('.js'));
    
    if (!i18nFile) {
      throw new Error('找不到 I18nProvider 檔案，Orca 可能已經大幅更改架構！');
    }
    
    const rendererPath = path.join(assetsDir, i18nFile);
    let rendererCode = fs.readFileSync(rendererPath, 'utf8');

    // 加入常數
    if (!rendererCode.includes('UI_LANGUAGE_TRADITIONAL_CHINESE = "zh-TW"')) {
      rendererCode = rendererCode.replace(
        'const UI_LANGUAGE_CHINESE = "zh";',
        'const UI_LANGUAGE_CHINESE = "zh";\nconst UI_LANGUAGE_TRADITIONAL_CHINESE = "zh-TW";'
      );
    }
    // 加入下拉選單
    if (!rendererCode.includes('labelKey: "settings.appearance.language.traditionalChinese"')) {
      rendererCode = rendererCode.replace(
        '{ value: UI_LANGUAGE_CHINESE, labelKey: "settings.appearance.language.chinese" },',
        '{ value: UI_LANGUAGE_CHINESE, labelKey: "settings.appearance.language.chinese" },\n  { value: UI_LANGUAGE_TRADITIONAL_CHINESE, labelKey: "settings.appearance.language.traditionalChinese" },'
      );
    }
    // 加入 Enum 白名單
    if (!rendererCode.includes('UI_LANGUAGE_TRADITIONAL_CHINESE,') && rendererCode.includes('UI_LANGUAGE_VALUES =')) {
      rendererCode = rendererCode.replace(
        'UI_LANGUAGE_CHINESE,\n  UI_LANGUAGE_KOREAN',
        'UI_LANGUAGE_CHINESE,\n  UI_LANGUAGE_TRADITIONAL_CHINESE,\n  UI_LANGUAGE_KOREAN'
      );
    }
    // 加入 Fallback 文字
    if (!rendererCode.includes('[UI_LANGUAGE_TRADITIONAL_CHINESE]:')) {
      rendererCode = rendererCode.replace(
        '[UI_LANGUAGE_CHINESE]: "中文（简体）",',
        '[UI_LANGUAGE_CHINESE]: "中文（简体）",\n  [UI_LANGUAGE_TRADITIONAL_CHINESE]: "中文（繁體）",'
      );
    }
    // 注入翻譯檔案 Loader
    if (!rendererCode.includes('"zh-TW": () =>')) {
      rendererCode = rendererCode.replace(
        /ko: \(\) => __vitePreload\(\(\) => import\("\.\/ko-[a-zA-Z0-9_-]+\.js"\), [^,]+, import\.meta\.url\),/,
        `$& \n  "zh-TW": () => __vitePreload(() => import("./zh-TW-nested.js"), true ? [] : void 0, import.meta.url),`
      );
    }
    fs.writeFileSync(rendererPath, rendererCode);

    console.log('📂 4/5 正在植入 11,000 句繁體中文翻譯字典包...');
    const dictSource = path.join(__dirname, 'zh-TW-nested.js');
    if (!fs.existsSync(dictSource)) {
      throw new Error(`找不到字典檔：${dictSource}`);
    }
    fs.copyFileSync(dictSource, path.join(assetsDir, 'zh-TW-nested.js'));

    console.log('🗜️ 5/5 正在重新打包 app.asar (這可能需要數十秒)...');
    await asar.createPackage(unpackedDir, orcaPath);
    
    // 清理
    fs.rmSync(workDir, { recursive: true, force: true });

    console.log('\n🎉 安裝成功！請完全關閉 Orca (右下角 Quit) 並重新啟動！');
    console.log('然後前往 Settings -> Appearance -> Language 切換為「中文（繁體）」。\n');

  } catch (err) {
    console.error('\n❌ 安裝過程中發生錯誤：', err.message);
    console.error('已經為您保留了原始的 app.asar.bak 備份檔。');
  }
}

patch();

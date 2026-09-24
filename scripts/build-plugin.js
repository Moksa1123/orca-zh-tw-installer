#!/usr/bin/env node
// 由 orca_zh_TW_translation.json 產生 Orca 官方外掛格式的繁中語言包。
//
// Orca 1.4.2xx 起有外掛系統，外掛可以用 contributes.languagePacks 提供語系。
// 語言包就是一份 i18next catalog，鍵與 Orca 內建翻譯相同——跟我們原本注入
// app.asar 的字典是同一個東西，只是改由 Orca 自己載入。
//
// 好處是不必再改 app.asar：Orca 自動更新不會把它洗掉，也不必關閉 Orca 才能裝。
//
// 輸出：orca-plugin/
//   orca-plugin.json        外掛 manifest
//   locales/zh-TW.json      語言包 catalog（巢狀 JSON）
//
// Orca 對語言包的限制（見 out/shared/plugins/plugin-language-pack-artifact.js）：
//   總項目數 ≤ 20,000（物件節點也算）、深度 ≤ 16、單句 ≤ 8,192 字元、
//   檔案 ≤ 5 MB、鍵不可含 "." 或控制字元、不可覆寫
//   auto.components.settings.Plugin* 這類外掛安全文案（少數外框文字例外）。
// 任何一項不合，整包都會被 Orca 拒絕，所以這裡先過濾、再自我檢查一次。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'orca_zh_TW_translation.json');
const OUT = path.join(ROOT, 'orca-plugin');
const pkg = require(path.join(ROOT, 'package.json'));

const MAX_ENTRIES = 20_000;
const MAX_DEPTH = 16;
const MAX_STRING = 8192;
const MAX_BYTES = 5 * 1024 * 1024;
const PROTECTED_ROOT = 'auto.components.settings.';

// Orca 允許翻譯的外掛設定頁外框文字（plugin-translatable-chrome.js 的白名單）。
// 其餘 auto.components.settings.Plugin* 一律是受保護的安全文案。
const TRANSLATABLE_CHROME = new Set([
  'auto.components.settings.PluginsSettingsSection.title',
  'auto.components.settings.PluginsSettingsSection.systemLabel',
  'auto.components.settings.PluginsSettingsSection.install',
  'auto.components.settings.PluginsSettingsSection.loading',
  'auto.components.settings.PluginsSettingsSection.empty',
  'auto.components.settings.PluginsSettingsSection.emptyTitle',
  'auto.components.settings.PluginsSettingsSection.noInstalledResults',
  'auto.components.settings.PluginsSettingsSection.noInstalledResultsTitle',
  'auto.components.settings.PluginMarketplaceBrowser.manageSources',
  'auto.components.settings.PluginMarketplaceBrowser.addSource',
  'auto.components.settings.PluginMarketplaceBrowser.refresh',
  'auto.components.settings.PluginMarketplaceBrowser.refreshing',
  'auto.components.settings.PluginMarketplaceBrowser.loading',
  'auto.components.settings.PluginMarketplaceBrowser.tryAgain',
  'auto.components.settings.PluginMarketplaceBrowser.clearSearch',
  'auto.components.settings.PluginMarketplaceBrowser.empty',
  'auto.components.settings.PluginMarketplaceBrowser.emptyTitle',
  'auto.components.settings.PluginMarketplaceBrowser.noInstalled',
  'auto.components.settings.PluginMarketplaceBrowser.noInstalledTitle',
  'auto.components.settings.PluginMarketplaceBrowser.noResults',
  'auto.components.settings.PluginMarketplaceBrowser.noResultsTitle',
  'auto.components.settings.PluginMarketplaceBrowser.noSourcesTitle',
  'auto.components.settings.PluginDevelopmentSection.title',
  'auto.components.settings.PluginDevelopmentSection.add',
  'auto.components.settings.PluginDevelopmentSection.remove',
  'auto.components.settings.PluginDevelopmentSection.pathLabel',
  'auto.components.settings.PluginDevelopmentSection.pathRequired',
  'auto.components.settings.PluginDevelopmentSection.placeholder',
  'auto.components.settings.plugins.search.title',
  'auto.components.settings.plugins.search.description',
  'auto.components.settings.plugins.search.install',
  'auto.components.settings.plugins.search.permissions',
  'auto.components.settings.plugins.search.logs',
  'auto.components.settings.plugins.search.development',
]);

// 翻譯後會讓 Orca 設定頁崩潰的鍵，一律不放進語言包（維持英文）。
//
// Orca 設定頁用「翻譯後的標題」去清單裡找項目，找不到就 throw：
//   function Z(e){ let t = dn().find(t => t.title === e); if(!t) throw Error(...) }
//   ... Z(h(`…cloudVmTitle`, `Cloud VM`))
// 清單 dn() 經過 localized-catalog 快取，而那個快取只看 i18n.language 有沒有變。
// 外掛語言包是先切到 plugin… 語言代碼、翻譯內容稍後才非同步載入；快取若在
// 這段空窗期算好，標題就以英文存進去，翻譯載入後語言代碼沒變、快取不會更新。
// 之後查找端翻出「雲端 VM」、快取裡是「Cloud VM」，對不上 → 設定頁整頁崩潰
// （Missing experimental-pane search entry: "雲端 VM"）。
//
// 這是 Orca 的競態，我們改不了它的程式碼。讓這幾個鍵兩端都固定是英文，就怎麼算都對得上。
// 來源：useSettingsNavigationMetadata chunk 裡 an()／Z() 兩個查找函式的全部呼叫點。
const LOOKUP_BY_TITLE = new Set([
  'auto.components.settings.advanced.search.11eea3da72',
  'auto.components.settings.experimental.search.87d99e634b',
  'auto.components.settings.experimental.search.nativeChat.title',
  'auto.components.settings.experimental.search.agentDashboard.title',
  'auto.components.settings.experimental.search.9e4ddf776d',
  'auto.components.settings.experimental.search.agentHibernation.title',
  'auto.components.settings.experimental.search.newWorktreeCardStyle.title',
  'auto.components.settings.ephemeralVms.search.cloudVmTitle',
]);

const isProtected = k =>
  k.startsWith(PROTECTED_ROOT) &&
  !TRANSLATABLE_CHROME.has(k) &&
  /^plugin/i.test(k.slice(PROTECTED_ROOT.length));

const flat = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const dropped = { protected: [], lookupByTitle: [], tooLong: [], unsafeKey: [] };
const nested = {};

for (const [key, value] of Object.entries(flat)) {
  if (isProtected(key)) { dropped.protected.push(key); continue; }
  if (LOOKUP_BY_TITLE.has(key)) { dropped.lookupByTitle.push(key); continue; }
  // 被誤收進字典的 CSS 樣式碼會超過單句上限；它們本來就不需要翻譯，
  // 排除後 Orca 會用內建原文，畫面不受影響。
  if (value.length > MAX_STRING) { dropped.tooLong.push(key); continue; }
  const parts = key.split('.');
  if (parts.some(p => !p || p.length > 128 || /[\x00-\x1f]/.test(p) ||
      p === '__proto__' || p === 'prototype' || p === 'constructor')) {
    dropped.unsafeKey.push(key); continue;
  }
  let node = nested;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof node[parts[i]] === 'string') {
      throw new Error(`鍵衝突：${parts.slice(0, i + 1).join('.')} 同時是字串與物件`);
    }
    node = node[parts[i]] = node[parts[i]] || {};
  }
  node[parts[parts.length - 1]] = value;
}

// 自我檢查：用與 Orca 相同的算法數項目與深度
let entries = 0;
let depth = 0;
(function walk(o, d) {
  depth = Math.max(depth, d);
  for (const v of Object.values(o)) {
    entries++;
    if (typeof v !== 'string') walk(v, d + 1);
  }
})(nested, 0);

const catalog = JSON.stringify(nested, null, 1) + '\n';
const bytes = Buffer.byteLength(catalog);
const problems = [];
if (entries > MAX_ENTRIES) problems.push(`項目數 ${entries} 超過 ${MAX_ENTRIES}`);
if (depth > MAX_DEPTH) problems.push(`深度 ${depth} 超過 ${MAX_DEPTH}`);
if (bytes > MAX_BYTES) problems.push(`大小 ${bytes} bytes 超過 ${MAX_BYTES}`);
if (problems.length) {
  console.error('❌ 語言包不符合 Orca 限制：\n   ' + problems.join('\n   '));
  process.exit(1);
}

const manifest = {
  manifestVersion: 1,
  id: 'zh-tw',
  publisher: 'moksa',
  name: '繁體中文（台灣）語言包',
  version: pkg.version,
  description: 'Orca 台灣正體中文介面翻譯，對照 VS Code 官方 zh-TW 用語精修。',
  author: { name: 'Moksa', url: 'https://github.com/Moksa1123' },
  repository: 'https://github.com/Moksa1123/orca-zh-tw-installer',
  engines: { orca: '>=1.4.206' },
  pluginApi: 1,
  contributes: {
    languagePacks: [{ locale: 'zh-TW', path: 'locales/zh-TW.json' }],
  },
};

fs.mkdirSync(path.join(OUT, 'locales'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'orca-plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'locales', 'zh-TW.json'), catalog);

console.log(`✅ orca-plugin/ 已產生（v${pkg.version}）`);
console.log(`   翻譯 ${Object.keys(flat).length - Object.values(dropped).reduce((n, l) => n + l.length, 0)} 句`
  + `・項目 ${entries}/${MAX_ENTRIES}・深度 ${depth}/${MAX_DEPTH}・${(bytes / 1024).toFixed(0)} KB`);
for (const [why, list] of Object.entries(dropped)) {
  if (list.length) console.log(`   排除 ${why}：${list.length} 句`);
}

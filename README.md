<div align="center">

# Orca AI IDE 台灣正體中文語系包

**Orca zh-TW Language Pack & Installer**

為 Orca AI 程式開發環境提供專業的台灣在地化繁體中文支援

[![npm version](https://img.shields.io/npm/v/orca-zh-tw-installer.svg?style=flat-square)](https://www.npmjs.com/package/orca-zh-tw-installer)
[![npm downloads](https://img.shields.io/npm/dt/orca-zh-tw-installer.svg?style=flat-square)](https://www.npmjs.com/package/orca-zh-tw-installer)
[![node](https://img.shields.io/node/v/orca-zh-tw-installer.svg?style=flat-square)](https://nodejs.org)
[![platforms](https://img.shields.io/badge/platforms-Win%20%7C%20Mac%20%7C%20Linux-blue?style=flat-square)](#支援的作業系統)
[![license](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](LICENSE)
[![stars](https://img.shields.io/github/stars/Moksa1123/orca-zh-tw-installer?style=flat-square)](https://star-history.com/#Moksa1123/orca-zh-tw-installer&Date)

[安裝](#安裝orca-14206-以上) | [支援版本](#支援版本) | [功能特色](#功能特色)

</div>

---

## 關於專案

為 Orca 提供超過 13,000 句針對台灣軟體工程師習慣精修的繁體中文翻譯，
對照 VS Code 官方 zh-TW 語系包與術語鎖定表，確保一詞一譯。

**Orca 1.4.206 起以官方外掛形式提供**：在 Orca 裡貼一行網址就能安裝，
不修改任何程式檔案，Orca 自動更新也不會把它洗掉。

---

## 安裝（Orca 1.4.206 以上）

1. Orca → **Settings → Plugins → Install**
2. 選 **Git URL**，貼上：

   ```
   https://github.com/Moksa1123/orca-zh-tw-installer#plugin-v3.0.0
   ```

3. 檢視權限後啟用。這個外掛只含語言包，沒有可執行的程式碼。
4. **Settings → Appearance → Language** → 選 `zh-TW — moksa.zh-tw`

不需要 Node.js，也不必先關閉 Orca。

> 網址結尾的 `#plugin-v3.0.0` 是版本標記，Orca 會固定安裝那一版。
> 之後要更新，在 Plugins 頁面移除後改貼新版網址即可（最新版號見本頁「支援版本」）。

### 從舊版（npx 安裝器）換過來

以前用 `npx orca-zh-tw-installer` 修補過 `app.asar` 的話，先還原官方版本再裝外掛，
避免兩者互相干擾：

```bash
# 先完全關閉 Orca（系統匣圖示右鍵 → Quit），然後：
npx orca-zh-tw-installer@latest --restore
```

Orca 自動更新過的話，官方版本其實已經蓋掉舊補丁了，這步可以略過。

---

## 支援版本

| 項目 | 版本 |
|---|---|
| **語系包** | v3.0.0 |
| **外掛安裝，已驗證** | Orca 1.4.206 |
| **npx 安裝器（舊方式），已測試** | Orca 1.4.161 ～ 1.4.180 |

驗證方式：以 Orca 內建的 es／ja／ko／fr 語系為基準比對翻譯鍵，確認沒有缺漏；
語言包並以 Orca 自己的外掛驗證程式檢查過格式與限制。

Orca 更新頻繁，新功能會帶來新的英文字串，字典沒跟上的部分會暫時顯示英文，
介面其餘部分不受影響。發現英文沒翻到，歡迎[回報 Issue](https://github.com/Moksa1123/orca-zh-tw-installer/issues)。

---

## 功能特色

| 功能 | 說明 |
|------|------|
| **官方外掛安裝** | 透過 Orca 外掛系統載入，不修改 `app.asar`，自動更新後依然有效 |
| **專業工程術語** | 對照 VS Code 官方 zh-TW 語系包精修，術語鎖定表確保一詞一譯（如 存放庫、終端機、Worktree）|
| **高曝光介面已逐句校對** | 側邊欄、原始碼控制、編輯器、狀態列、分頁等完成兩輪複查 |
| **系統匣與原生對話框** | 語言包同時套用在 main process，系統匣與對話框一併中文化 |

### 外掛做不到的部分

少數字串沒有走 Orca 的翻譯系統，而是直接寫死在程式碼裡，例如原生選單列的部分項目、
快速鍵名稱、斜線命令說明與新手引導。語言包碰不到這些，所以會維持英文。

外掛權限審核相關的文案，Orca 刻意禁止語言包改寫（防止惡意外掛把警告改成安撫的話），
這部分也會維持英文。

---

## 舊版 Orca（1.4.180 以下）：npx 安裝器

Orca 1.4.206 以前沒有外掛語言包，仍可用原本的安裝器直接修補 `app.asar`。
在 1.4.206 以上執行它，只會顯示上面的外掛安裝步驟，不會動任何檔案。

需要 Node.js。**請先完全關閉 Orca**（系統匣圖示右鍵 → Quit），然後：

```bash
npx orca-zh-tw-installer
```

不會用命令列的話，可以下載後雙擊 [`安裝繁體中文.bat`](安裝繁體中文.bat)（Windows）
或 [`安裝繁體中文.command`](安裝繁體中文.command)（macOS），它會先檢查 Node.js 與 Orca 狀態。

裝好後重新啟動 Orca，到 `Settings -> Appearance -> Language` 選 `中文（繁體）`。

```bash
npx orca-zh-tw-installer --dry-run   # 只檢查相容性，不改動 Orca（執行中也能安全跑）
npx orca-zh-tw-installer --verify    # 檢查已安裝的 app.asar 是否含全部補丁與字典
npx orca-zh-tw-installer --restore   # 一鍵還原成官方原版（先關閉 Orca）
npx orca-zh-tw-installer --help      # 顯示說明
```

`--restore` 動手前會確認備份存在、Orca 已關閉、備份本身是乾淨的，任一不過就中止。
無法使用該指令時，也可手動把 `resources/app.asar.bak` 複製回 `app.asar`。

---

## 支援的作業系統

腳本會依據環境自動判定預設安裝路徑：

| 作業系統 | 預設自動掃描路徑 |
|----------|----------------|
| **Windows** | `AppData/Local/Programs/orca/resources/app.asar` |
| **macOS** | `/Applications/Orca.app/Contents/Resources/app.asar` |
| **Linux** | `/opt/Orca/resources/app.asar` |

*註：若您的 Orca 安裝於非標準路徑，腳本會提示找不到檔案，您可手動覆蓋處理。*

---

## 開發與手動安裝

若需檢視翻譯內容或手動封裝，請將專案 clone 至本地端：

```bash
git clone <repository-url>
cd orca_ZH_TW
npm install
npm start
```

### 檔案結構

- `index.js`：核心安裝腳本，處理 asar 解包、修補、驗證與封裝。支援 `--dry-run`。
- `orca_zh_TW_translation.json`：**唯一的翻譯來源**（扁平點分鍵）。改翻譯只改這個檔。
- `zh-TW-nested.js`：由來源檔產生的 ESM 字典，供 Renderer 載入。**請勿手動編輯。**
- `zh-TW-nested.cjs.js`：由來源檔產生的 CJS 字典，供 Main process 載入。**請勿手動編輯。**
- `scripts/build-nested.js`：由 JSON 產生上述兩個字典檔。
- `scripts/build-plugin.js`：由 JSON 產生 Orca 外掛（`orca-plugin/`），並檢查 Orca 對語言包的各項限制。
- `scripts/sweep-terms.js`：依術語鎖定表統一用詞，預設 dry-run。
- `scripts/sweep-spacing.js`：中英之間補半形空格，預設 dry-run。
- `scripts/verify-install.js`：驗證已安裝的 `app.asar` 是否含全部補丁與字典。
- `scripts/extract-reference-locale.js`：從 asar 抽出 es/ja/ko 語系當原文對照。
- `scripts/audit-identifiers.js`：三語對照找被誤譯的識別碼（`npm` 曾被譯成「新專案管理」）。
- `scripts/audit-batch.js`：機械式複查——未翻譯、半形標點、截斷、同義重複、過長標籤。

### 為什麼需要對照語言

Orca **沒有 en 語系檔**（英文是內嵌的 fallback），所以無法直接取得原文。
但 es/ja/ko 的 key 與中文完全相同，可用來反推原意：

```bash
node scripts/extract-reference-locale.js es > ref-es.json
npm run audit:identifiers
```

判準是「三語的值完全相同 → 那幾乎確定是識別碼」——三個獨立譯者都選擇不翻，
中文卻翻了，就是誤譯。這抓到過 `npm`→新專案管理、`osc52`→作業系統 52、
`feat/mobile-page`→壯舉/手機頁面。

對照語言只是**參考而非標準**：有些字（`idle`→空閒）中文譯法比其他語言保留原文更好。

### 改翻譯的流程

`zh-TW-nested.js` 與 `zh-TW-nested.cjs.js` 都是**產生物**，編輯 JSON 後必須重新建置，
否則安裝時不會生效：

```bash
# 1. 編輯 orca_zh_TW_translation.json
# 2. 重新產生字典檔（兩種格式）
npm run build
# 3. 產生外掛（orca-plugin/），可用 Local folder 安裝測試
npm run build:plugin
# 4. 發布外掛分支（只做本機 commit 與 tag，確認後再 push）
npm run release:plugin
```

---

## 免責聲明

此為非官方社群補丁，僅修改本地客戶端檔案。安裝過程會自動建立 `app.asar.bak` 備份檔，如遇應用程式異常，請自行還原備份檔案。

---

<div align="center">

**Made for the Taiwan Developer Community**

</div>

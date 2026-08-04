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

[快速開始](#快速開始) | [功能特色](#功能特色) | [支援版本](#支援版本) | [支援系統](#支援的作業系統)

</div>

---

## 關於專案

官方 Orca 內建的語言系統具有白名單限制，若強制選擇繁體中文會被退回預設語言（System）或簡體中文。本專案透過跨平臺自動化腳本，解除官方白名單限制，並注入超過 11,000 句針對台灣軟體工程師習慣精修的在地化翻譯。

---

## 支援版本

| 項目 | 版本 |
|---|---|
| **語系包** | v2.13.13 |
| **已測試相容的 Orca 版本** | 1.4.161、1.4.162、1.4.163、1.4.166、1.4.168 |

Orca 更新頻繁，且每次更新都可能改動內部程式碼結構（變數命名、chunk 檔案切分方式等），
導致本包的修補錨點失效；也可能新增功能、帶來全新的英文字串，字典若沒跟著更新，
那部分就會維持英文。**版本號不代表保證相容未來所有 Orca 更新**——只代表列出的
版本經過實際安裝、`--dry-run`，以及對照 Orca 官方 es/ja/ko 語系檔案比對過
新增／異動的翻譯鍵，確認核心字典沒有缺漏。

安裝前建議先確認相容性，尤其是 Orca 剛更新完的情況：

```bash
npx orca-zh-tw-installer --dry-run
```

若輸出全部是 ✅（零 ⚠️、零 ❌），代表跟你目前的 Orca 版本相容，可以放心正式安裝。
若看到 ❌ 或大量 ⚠️，代表 Orca 更新後改了程式碼結構，需要等本包更新或
[回報 Issue](https://github.com/Moksa1123/orca-zh-tw-installer/issues)。

---

## 功能特色

| 功能 | 說明 |
|------|------|
| **一鍵跨平臺安裝** | 透過 `npx` 自動偵測作業系統並完成替換 |
| **自動破解白名單** | 突破官方限制，將 `zh-TW` 寫入前端與核心白名單 |
| **解除繁中強制降級** | 官方新版會把 `zh-TW`／`zh-HK`／`zh-Hant` 明確打回英文，本包一併解除 |
| **原生選單也中文化** | 除了介面，系統匣、原生選單、系統對話框（main process）同樣套用繁中 |
| **專業工程術語** | 對照 VS Code 官方 zh-TW 語系包精修，303 條術語鎖定表確保一詞一譯（如 存放庫、終端機、Worktree）|
| **高曝光介面已逐句校對** | 側邊欄、原始碼控制、編輯器、狀態列、分頁等 3,502 句完成兩輪複查，修正約 2,500 處誤譯與不一致 |
| **安裝後自動驗證** | 重新封裝前檢查全部注入點，任一失敗即中止且不改動 `app.asar`，不會「安裝成功卻沒效果」|
| **無痛備份機制** | 首次安裝自動備份 `app.asar.bak`；重複執行會偵測既有補丁，不會用已修補版覆蓋乾淨備份 |
| **自動追蹤更新** | npm 發布機制確保未來套用更新時始終取得最新版本 |

---

## 快速開始

### 方法一：雙擊執行（不需要會用命令列）

從本專案下載這兩個檔案其中之一，直接雙擊：

| 系統 | 檔案 |
|---|---|
| Windows | [`安裝繁體中文.bat`](安裝繁體中文.bat) |
| macOS | [`安裝繁體中文.command`](安裝繁體中文.command) |

它會自己檢查 Node.js 有沒有裝、Orca 有沒有關掉，然後完成安裝。
沒裝 Node.js 的話會直接給你下載連結，不會丟一句看不懂的錯誤訊息。

> macOS 首次執行若被擋下，在該檔案按右鍵 → 開啟 → 開啟。

還原成官方版本：雙擊 [`還原官方版本.bat`](還原官方版本.bat)（Windows）。

### 方法二：命令列

請確認系統已安裝 Node.js。開啟終端機並輸入以下指令：

```bash
npx orca-zh-tw-installer
```

> 注意：套件名稱是 `orca-zh-tw-installer`。指令名稱雖然是 `orca-zh-tw`，
> 但 `npx orca-zh-tw` 會被當成套件名去 registry 查詢而得到 404。

**請先完全關閉 Orca**（系統匣圖示右鍵 → Quit，不是只關閉視窗）。
安裝腳本會偵測 Orca 是否仍在執行並直接中止——因為在執行中替換
`app.asar` 之後，那個 Orca 實例的 renderer 還握著舊的檔名，
去載入時會拋出 `Unexpected token` 並讓側邊欄等面板顯示錯誤。
那是一次性的、重啟即消失，但很容易被誤認為語系包壞了。

腳本將自動執行以下流程：
1. 自動定位作業系統對應的 Orca 安裝路徑並解包。
2. 備份官方 `app.asar`（已含補丁時會保留原本的乾淨備份）。
3. 破解主程式（Main）語言限制與 locale 解析。
4. 破解渲染器（Renderer）語言限制、下拉選單與 locale 解析。
5. 注入 11,000 句繁體中文字典（ESM 給 Renderer、CJS 給 Main）。
6. 驗證全部注入點後重新封裝。

### 其他指令

全部都用同一個入口，不需要 clone 這個專案：

```bash
npx orca-zh-tw-installer --dry-run   # 只檢查相容性，不改動 Orca（執行中也能安全跑）
npx orca-zh-tw-installer --verify    # 檢查已安裝的 app.asar 是否含全部補丁與字典
npx orca-zh-tw-installer --restore   # 一鍵還原成官方原版
npx orca-zh-tw-installer --verbose   # 列出每一個注入點（預設只印總數）
npx orca-zh-tw-installer --force     # 即使 Orca 執行中也強制套用（不建議）
npx orca-zh-tw-installer --help      # 顯示說明
```

`--dry-run` 適合在 Orca 更新後先跑，確認語系包是否仍與新版相容。

### 出問題時：一鍵還原

```bash
# 先完全關閉 Orca，然後：
npx orca-zh-tw-installer --restore
```

動手前會檢查三件事，任一不過就中止且不動你的檔案：

| 檢查 | 為什麼 |
|---|---|
| 備份存在 | 沒有備份就無從還原 |
| Orca 已完全關閉 | 執行中替換 `app.asar` 會讓那個實例噴 `Unexpected token`，看起來像還原失敗 |
| **備份本身是乾淨的** | 備份若已含補丁（某次安裝中斷所致），還原了仍是中文，只會更困惑 |

還原後**備份檔保留不刪**，之後想再套用繁中直接執行 `npx orca-zh-tw-installer`。

若因故無法使用該指令，也可以手動複製：

```powershell
# Windows
Copy-Item "$env:LOCALAPPDATA\Programs\orca\resources\app.asar.bak" `
          "$env:LOCALAPPDATA\Programs\orca\resources\app.asar" -Force
```

```bash
# macOS
cp /Applications/Orca.app/Contents/Resources/app.asar{.bak,}
```

---

## 啟用教學

1. 安裝完成後，請**徹底關閉 Orca**（於系統工具列右鍵選擇 Quit）。
2. 重新啟動 Orca 應用程式。
3. 進入 `Settings -> Appearance -> Language`。
4. 選擇 `中文（繁體）` 即可套用。

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
# 3. 套用
npm start
```

---

## 免責聲明

此為非官方社群補丁，僅修改本地客戶端檔案。安裝過程會自動建立 `app.asar.bak` 備份檔，如遇應用程式異常，請自行還原備份檔案。

---

<div align="center">

**Made for the Taiwan Developer Community**

</div>

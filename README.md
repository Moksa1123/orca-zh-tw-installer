<div align="center">

# Orca AI IDE 台灣正體中文語系包

**Orca zh-TW Language Pack & Installer**

為 Orca AI 程式開發環境提供專業的台灣在地化繁體中文支援

[![npm version](https://img.shields.io/npm/v/orca-zh-tw-installer.svg?style=flat-square)](https://www.npmjs.com/package/orca-zh-tw-installer)
[![npm downloads](https://img.shields.io/npm/dt/orca-zh-tw-installer.svg?style=flat-square)](https://www.npmjs.com/package/orca-zh-tw-installer)
[![node](https://img.shields.io/node/v/orca-zh-tw-installer.svg?style=flat-square)](https://nodejs.org)
[![platforms](https://img.shields.io/badge/platforms-Win%20%7C%20Mac%20%7C%20Linux-blue?style=flat-square)](#支援的作業系統)
[![license](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](LICENSE)

[快速開始](#快速開始) | [功能特色](#功能特色) | [支援系統](#支援的作業系統)

</div>

---

## 關於專案

官方 Orca 內建的語言系統具有白名單限制，若強制選擇繁體中文會被退回預設語言（System）或簡體中文。本專案透過跨平臺自動化腳本，解除官方白名單限制，並注入超過 11,000 句針對台灣軟體工程師習慣精修的在地化翻譯。

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

請確認系統已安裝 Node.js。開啟終端機並輸入以下指令：

```bash
npx orca-zh-tw
```

腳本將自動執行以下流程：
1. 自動定位作業系統對應的 Orca 安裝路徑並解包。
2. 備份官方 `app.asar`（已含補丁時會保留原本的乾淨備份）。
3. 破解主程式（Main）語言限制與 locale 解析。
4. 破解渲染器（Renderer）語言限制、下拉選單與 locale 解析。
5. 注入 11,000 句繁體中文字典（ESM 給 Renderer、CJS 給 Main）。
6. 驗證全部注入點後重新封裝。

若想在不改動 Orca 的前提下先確認相容性（**可在 Orca 執行中安全使用**）：

```bash
npm run dry-run
```

安裝後可驗證實際封裝結果：

```bash
npm run verify
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

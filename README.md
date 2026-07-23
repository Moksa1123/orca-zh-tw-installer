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
| **專業工程術語** | 翻譯精修，針對台灣開發者習慣用語（如 Worktree、終端機） |
| **無痛備份機制** | 安裝前自動備份原始檔案（`app.asar.bak`），確保環境安全 |
| **自動追蹤更新** | npm 發布機制確保未來套用更新時始終取得最新版本 |

---

## 快速開始

請確認系統已安裝 Node.js。開啟終端機並輸入以下指令：

```bash
npx orca-zh-tw
```

腳本將自動執行以下流程：
1. 自動定位作業系統對應的 Orca 安裝路徑。
2. 備份官方 `app.asar`。
3. 解包並破解主程式與渲染器（Renderer）語言限制。
4. 注入 11,000 句繁體中文字典檔。
5. 重新封裝。

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

- `index.js`: 核心安裝腳本，處理 asar 解包、修補與封裝。
- `zh-TW-nested.js`: Orca 前端讀取的最終編譯檔。
- `orca_zh_TW_translation.json`: 原始語系字典檔，若欲改善翻譯可直接編輯此檔案。

---

## 免責聲明

此為非官方社群補丁，僅修改本地客戶端檔案。安裝過程會自動建立 `app.asar.bak` 備份檔，如遇應用程式異常，請自行還原備份檔案。

---

<div align="center">

**Made for the Taiwan Developer Community**

</div>

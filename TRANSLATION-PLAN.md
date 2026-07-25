# 翻譯改善計畫

> Orca zh-TW 語系包的分批修訂計畫。中斷後接手請從「進度」往下讀。

## 為什麼需要這份文件

`orca_zh_TW_translation.json` 的 11,020 條字串中，**10,804 條（98%）在 `auto.*` 命名空間**，是機器批次產出的；
只有 216 條是手工精修。`auto.*` 那批的品質問題不是「翻錯」，而是**同一個詞在不同地方譯法不一致**，
以及少數簡繁轉換的機械殘留。

這類問題無法靠「再翻一次」解決——需要一份強制的術語表，加上按模組逐批對照畫面檢查。

## 進度

| 階段 | 狀態 | 說明 |
|---|---|---|
| **Tier 0a** 術語統一 | ✅ 完成 | 26 條規則 / 761 處，見 `scripts/sweep-terms.js` |
| **Tier 0b** 中英空格 | ✅ 完成 | 654 句 / 949 個空格，見 `scripts/sweep-spacing.js` |
| **Tier 1** 高曝光介面 | ⬜ 未開始 | 批次 #1–#12（3,502 句）|
| **Tier 2** 長文案 | ⬜ 未開始 | 批次 #13–#18（317 句但 30,898 字）|
| **Tier 3** 設定頁 | ⬜ 未開始 | 批次 #19–#29（3,873 句）|
| **Tier 4** 外部整合 | ⬜ 未開始 | 批次 #30–#36（1,960 句）|
| **Tier 5** 長尾模組 | ⬜ 未開始 | 批次 #37–#39（1,152 句）|
| **Tier 0** 手工精修區 | ⬜ 抽查即可 | 批次 #40（216 句），品質已達標 |

批號以「分批清單」一節為準（由 `scripts/plan-batches.js` 產生）。改動資料後重跑產生器，
批號可能位移——別把批號寫進 commit message 以外的地方。

## 術語鎖定表

單一真實來源：`~/.claude/skills/tw-translate/data/domains/lock.csv`（195 條）

欄位 `tier` 的意義：

- **A**：確定性替換，可機械 sweep
- **B**：需上下文判斷，**不可**機械替換（例：`應用` 可能是 apply→套用，也可能是 application→應用程式）
- **C**：已裁決的產品風格決定

`glossary.csv` 是**建議**，`lock.csv` 是**強制**。目前的用詞不一致就是因為過去只有建議、沒有強制。

### 已裁決的產品風格（勿再更動）

| 詞 | 決定 | 理由 |
|---|---|---|
| permission | **權限** | 台灣開發者慣用，不採 MS 的「許可權」 |
| pull request | **保留英文 Pull Request** | 與既有的 Agent / Issue / Worktree 保留策略一致 |
| stash | **保留英文 stash** | vscode-loc 的「隱藏項目」語意差 |
| worktree | **保留英文 Worktree** | 產品既有策略 |
| theme | **主題** | 「終端機主題」較自然，不採 VS Code 的「佈景主題」 |

### 刻意不鎖的詞（勿當成錯誤去「修正」）

| 詞 | 出現數 | 為何不改 |
|---|---:|---|
| 選擇 | 251 | 「選擇一個 Agent」是台灣自然用法；只有 selection/selected 才用「選取」 |
| 帳號 | 95 | 台灣自然用法，且**已經全檔一致**（帳戶 0 處） |
| 提交 | 118 | vscode-loc 確認 commit→提交 正確 |
| 暫存 | 25 | vscode-loc 確認 stage→暫存 正確 |
| 跳過 | 20 | 台灣同樣自然，MS 慣例才用「略過」 |
| 截圖 | 17 | MS 的「螢幕擷取畫面」過於冗長 |

## 分批原則

**雙上限：每批 400 句 / 6,000 字，取先到者。**

不能只用句數切，因為各模組句長差距達 14 倍：

| 模組 | 句數 | 字/句 |
|---|---:|---:|
| `components.tab` | 157 | 7 |
| `components.feature` | 317 | **97** |

`feature` 只有 317 句卻佔全檔 20% 的字數。純照句數切，某幾批的實際工作量會是別批的十倍。

**批次邊界貼齊模組**，這樣可以在 Orca 裡把那個畫面打開對照著看——那才是真正的品質關卡，比讀 JSON 有效得多。

## 每批的作業流程

```bash
# 1. 取出這批的實際內容（key + 現有譯文）
node scripts/plan-batches.js --batch 7

# 2. 對照 lock.csv 逐句檢查；在 Orca 裡打開對應畫面比對
# 3. 直接編輯 orca_zh_TW_translation.json

# 4. 確認沒有引入新的術語違規或空格問題（兩者都是 dry-run）
npm run lint:terms
npm run lint:spacing

# 5. 重新產生字典並套用
npm run build
npm start && npm run verify
```

檢查重點，依重要性排序：

1. **術語違規**：對照 `lock.csv` 的 tier A
2. **語意錯誤**：機器翻譯常見的「字面對但意思錯」，例如把 UI 標籤當句子翻
3. **佔位符**：`{{value0}}`、`{{count}}` 必須與原文數量一致
4. **語氣一致**：同一畫面內不要混用「你」與「您」
5. **長度**：按鈕、分頁標籤等寬度受限的元件，譯文別過長

---
## 分批清單

> 本表由 `node scripts/plan-batches.js` 產生，資料變動後請重跑。
> 上限：每批 400 句 / 6,000 字。
> 全檔合計 **11020 句 / 152,301 字**，共 **40 批**。

### Tier 1 — 高曝光介面

共 14 個模組、3502 句、38,342 字

| 批次 | 模組 | 句數 | 字數 |
|---|---|---:|---:|
| #1 | `components.right` (1/3) | ~336 | ~4,062 |
| #2 | `components.right` (2/3) | ~336 | ~4,062 |
| #3 | `components.right` (3/3) | ~336 | ~4,062 |
| #4 | `components.sidebar` (1/3) | ~283 | ~3,293 |
| #5 | `components.sidebar` (2/3) | ~283 | ~3,293 |
| #6 | `components.sidebar` (3/3) | ~283 | ~3,293 |
| #7 | `components.editor` (1/2) | ~233 | ~1,818 |
| #8 | `components.editor` (2/2) | ~233 | ~1,818 |
| #9 | `components.status` | 325 | 3,194 |
| #10 | `components.onboarding`<br>`components.tab` | 327 | 3,428 |
| #11 | `components.terminal`<br>`components.workspace`<br>`components.orca` | 361 | 4,224 |
| #12 | `components.NewWorkspaceComposerCard`<br>`components.new`<br>`components.rightSidebar`<br>`lib.terminal`<br>`lib.workspace` | 171 | 1,800 |

### Tier 2 — 長文案（導覽／功能牆）

共 1 個模組、317 句、30,898 字

| 批次 | 模組 | 句數 | 字數 |
|---|---|---:|---:|
| #13 | `components.feature` (1/6) | ~53 | ~5,150 |
| #14 | `components.feature` (2/6) | ~53 | ~5,150 |
| #15 | `components.feature` (3/6) | ~53 | ~5,150 |
| #16 | `components.feature` (4/6) | ~53 | ~5,150 |
| #17 | `components.feature` (5/6) | ~53 | ~5,150 |
| #18 | `components.feature` (6/6) | ~53 | ~5,150 |

### Tier 3 — 設定頁（量大、曝光低）

共 176 個模組、3873 句、48,099 字

| 批次 | 模組 | 句數 | 字數 |
|---|---|---:|---:|
| #19 | `settings.terminal`<br>`settings.general` | 382 | 3,106 |
| #20 | `settings.appearance`<br>`settings.AccountsPane`<br>`settings.repository` | 375 | 4,952 |
| #21 | `settings.TerminalPane`<br>`settings.mobile`<br>`settings.RepositoryHooksSection`<br>`settings.browser` | 358 | 4,336 |
| #22 | `settings.IntegrationsPane`<br>`settings.Settings`<br>`settings.RuntimeEnvironmentsPane`<br>`settings.TerminalWindowSection`<br>`settings.RepositoryPane` | 354 | 4,753 |
| #23 | `settings.experimental`<br>`settings.git`<br>`settings.AppearancePane`<br>`settings.agents`<br>`settings.accounts`<br>`settings.GitPane`<br>…等 7 個模組 | 371 | 3,911 |
| #24 | `settings.TerminalAppearanceSection`<br>`settings.CommitMessageAiPane`<br>`settings.notifications`<br>`settings.developer`<br>`settings.ExperimentalPane`<br>`settings.integrations`<br>…等 10 個模組 | 370 | 4,857 |
| #25 | `settings.token`<br>`settings.commit`<br>`settings.GeneralEditorSettingsSection`<br>`settings.VoicePane`<br>`settings.NotificationsPane`<br>`settings.SparsePresetSettingsSection`<br>…等 14 個模組 | 387 | 4,875 |
| #26 | `settings.WarpThemeImportModal`<br>`settings.jira`<br>`settings.AutoRenameBranchFromWorkSetting`<br>`settings.BrowserPane`<br>`settings.voice`<br>`settings.task`<br>…等 19 個模組 | 396 | 5,092 |
| #27 | `settings.advanced`<br>`settings.orchestration`<br>`settings.quick`<br>`settings.GrokAccountsSection`<br>`settings.SshTargetCard`<br>`settings.EphemeralVmsPane`<br>…等 28 個模組 | 396 | 4,937 |
| #28 | `settings.ShortcutsPane`<br>`settings.TasksPane`<br>`settings.tasks`<br>`settings.linear`<br>`settings.MobileRelayStatusSection`<br>`settings.CliSkillRuntimeSetup`<br>…等 47 個模組 | 397 | 5,870 |
| #29 | `settings.TerminalSettingsPreview`<br>`settings.PrivacyDiagnosticsRows`<br>`settings.MobileRelayBetaAvailability`<br>`settings.SkillUsageExampleDialog`<br>`settings.HiddenExperimentalGroup`<br>`settings.RecentTabOrderControl`<br>…等 37 個模組 | 87 | 1,410 |

### Tier 4 — 外部整合

共 16 個模組、1960 句、18,898 字

| 批次 | 模組 | 句數 | 字數 |
|---|---|---:|---:|
| #30 | `components.TaskPage` | 317 | 3,242 |
| #31 | `components.stats` | 259 | 2,095 |
| #32 | `components.automations` | 248 | 1,960 |
| #33 | `components.github` | 235 | 1,976 |
| #34 | `components.GitHubItemDialog`<br>`components.PullRequestPage` | 368 | 3,433 |
| #35 | `components.mobile`<br>`components.skills`<br>`components.GitLabItemDialog`<br>`components.linear` | 358 | 3,846 |
| #36 | `components.emulator`<br>`components.JiraIssueWorkspace`<br>`components.LinearItemDrawer`<br>`components.jira`<br>`lib.linear`<br>`components.gitlab` | 175 | 2,346 |

### Tier 5 — 長尾模組

共 123 個模組、1152 句、13,541 字

| 批次 | 模組 | 句數 | 字數 |
|---|---|---:|---:|
| #37 | `components.browser`<br>`store.slices`<br>`hooks.useSettingsNavigationMetadata`<br>`lib.agent`<br>`components.UpdateCard` | 374 | 4,624 |
| #38 | `components.floating`<br>`components.WorktreeJumpPalette`<br>`components.LinearIssueWorkspace`<br>`components.cmd`<br>`components.repo`<br>`components.activity`<br>…等 15 個模組 | 400 | 4,638 |
| #39 | `components.Terminal`<br>`components.sparse`<br>`components.StarNagCard`<br>`components.link`<br>`components.ui`<br>`components.diff`<br>…等 103 個模組 | 378 | 4,279 |

### Tier 0 — 手工精修區（品質已達標，僅抽查）

共 47 個模組、216 句、2,523 字

| 批次 | 模組 | 句數 | 字數 |
|---|---|---:|---:|
| #40 | `components.native-chat`<br>`components.agentSessionContinuation`<br>`settings.appearance`<br>`browser.loadFailure`<br>`worktreeJumpPalette.matchLabel`<br>`dashboardPopout.card`<br>…等 47 個模組 | 216 | 2,523 |

---

## 已知待辦（不屬於任何單一批次）

### 1. Tier B 逐句判斷項（11 條）

`lock.csv` 中 `tier=B` 的詞不可機械替換，需在批次中逐句處理：

| 詞 | 出現數 | 注意 |
|---|---:|---|
| `應用` → `套用` | 17 | 但 `應用程式`、`應用視窗` 不可改 |
| `請求` / `要求` | 67 / 28 | request 兩者在台灣皆自然；需確認是 request 還是 require |
| `依賴` → `相依性` | 3 | 「依賴項稽核」機械替換會變成「相依性項稽核」，需改寫整句 |
| `instance` → `執行個體` | — | 「實例」在台灣亦通用 |
| `release` → `發行` | — | 「發布」在台灣亦通用，視語境 |
| `blame` | — | 多數情況建議保留英文 |

### 2. 模擬器裝置名稱疑似整批誤譯

以下譯文看不出對應的原文，像是 device list 被整批亂翻，需回查原始英文：

```
米4a          振盪器52        作業系統52
M1 迷你·家     2 名兒童
```

### 3. 未翻譯項目中混有真漏翻

全檔有 884 條不含中文字元。多數是品牌名（Cursor、Hermes、OpenClaw…）**應當保留英文**，
但其中混了真正的漏翻，已確認的至少有：

```
"No live terminal — this agent's pane has closed."
"Agent Dashboard"
"Focus worktree"
"Close"
```

建議做法：先把 884 條全部列出，人工標記「品牌名」與「漏翻」，再只處理後者。

```bash
node -e "const j=require('./orca_zh_TW_translation.json');
Object.entries(j).filter(([,v])=>typeof v==='string'&&v.trim()&&!/[一-鿿]/.test(v))
.forEach(([k,v])=>console.log(k+'\t'+v))" > untranslated.tsv
```

### 4. npm 套件內含不必要的 workflow 檔

`orca-zh-tw-installer` 的 tarball 內含 `.github/workflows/npm-publish.yml`。
無害（使用者不會執行）但沒必要，在 `package.json` 加 `files` 白名單即可，
不值得為此單獨發版，下次發布時一起處理。

## 相關檔案

| 檔案 | 用途 |
|---|---|
| `orca_zh_TW_translation.json` | **唯一翻譯來源**，只改這個 |
| `scripts/plan-batches.js` | 產生本文件的分批清單；`--batch N` 取出某批內容 |
| `scripts/sweep-terms.js` | 依 lock.csv 統一術語，預設 dry-run |
| `scripts/sweep-spacing.js` | 中英之間補半形空格，預設 dry-run |
| `scripts/build-nested.js` | 產生 ESM + CJS 兩份字典 |
| `scripts/verify-install.js` | 驗證已安裝的 app.asar |
| `~/.claude/skills/tw-translate/data/domains/lock.csv` | 術語鎖定表 |

## 重要提醒

`zh-TW-nested.js` 與 `zh-TW-nested.cjs.js` 都是**產生物**。
改完 JSON 一定要 `npm run build`，否則安裝時不會生效——這個坑先前踩過一次。

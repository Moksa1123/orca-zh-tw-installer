#!/usr/bin/env node
// 把 orca-plugin/ 發布到 `plugin` 分支並打上 plugin-v<版本> tag。
//
// 為什麼要另一條分支：Orca 用 Git URL 安裝外掛時會 clone 整個 repo，
// 直接拿 repo 根目錄當外掛，不支援子資料夾。所以 orca-plugin.json 必須在根目錄。
// 這條分支是孤立分支，只放外掛本身；main 維持原本的專案結構。
//
// 使用者貼的網址：https://github.com/Moksa1123/orca-zh-tw-installer#plugin-v<版本>
//
// 這支腳本只做本機的 commit 與 tag，不會 push。確認無誤後再手動推：
//   git push origin plugin plugin-v<版本>
//
// tag 用 plugin-v 開頭，不會觸發 npm 發布（那個 workflow 只吃 v*.*.*）。

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const version = require(path.join(ROOT, 'package.json')).version;
const TAG = `plugin-v${version}`;
const BRANCH = 'plugin';
const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();

try { git(['rev-parse', '-q', '--verify', `refs/tags/${TAG}`]); console.error(`❌ tag ${TAG} 已存在，請先調整 package.json 版號`); process.exit(1); } catch {}

execFileSync(process.execPath, [path.join(__dirname, 'build-plugin.js')], { cwd: ROOT, stdio: 'inherit' });

const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-plugin-release-'));
let hasBranch = true;
try { git(['rev-parse', '-q', '--verify', `refs/heads/${BRANCH}`]); } catch { hasBranch = false; }

try {
  if (hasBranch) {
    git(['worktree', 'add', wt, BRANCH]);
  } else {
    git(['worktree', 'add', '--detach', wt]);
    git(['checkout', '--orphan', BRANCH], { cwd: wt });
  }
  // 清空後放入外掛檔案
  for (const f of fs.readdirSync(wt)) if (f !== '.git') fs.rmSync(path.join(wt, f), { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'orca-plugin'), wt, { recursive: true });
  if (fs.existsSync(path.join(ROOT, 'LICENSE'))) fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(wt, 'LICENSE'));
  fs.writeFileSync(path.join(wt, 'README.md'), [
    '# Orca 繁體中文（台灣）語言包',
    '',
    '這條分支只放 Orca 外掛本身，供 Orca 以 Git URL 安裝。',
    '說明、原始字典與問題回報請見 [main 分支](https://github.com/Moksa1123/orca-zh-tw-installer)。',
    '',
    '安裝：Orca → Settings → Plugins → Install → Git URL，貼上',
    '',
    '```',
    `https://github.com/Moksa1123/orca-zh-tw-installer#${TAG}`,
    '```',
    '',
  ].join('\n'));

  git(['add', '-A'], { cwd: wt });
  git(['commit', '-m', `plugin: v${version}`], { cwd: wt });
  git(['tag', '-a', TAG, '-m', `Orca 外掛語言包 v${version}`], { cwd: wt });
  console.log(`\n✅ 已在 ${BRANCH} 分支 commit 並打上 ${TAG}（尚未 push）`);
  console.log(`   推送：git push origin ${BRANCH} ${TAG}`);
} finally {
  try { git(['worktree', 'remove', '--force', wt]); } catch {}
}

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

// 用 git 底層指令直接組 commit：暫時的 index 只放外掛檔案，不建 worktree、
// 不動任何工作目錄。
//
// 第一版用 worktree + 孤立分支，踩到兩個坑：Node 25 在 Windows 上對 worktree
// 做遞迴 rmSync／cpSync 會原生崩潰（0xC0000409，沒有錯誤訊息）；改用 git rm
// 清空後又靜默失敗，結果分支裡混進 main 的全部檔案。
// 這個做法裡，commit 的內容就是下面明確列出的檔案，沒有「清空」這一步可以失敗。
const files = [];
(function collect(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) collect(abs, r); else files.push([r, fs.readFileSync(abs)]);
  }
})(path.join(ROOT, 'orca-plugin'), '');
files.push(['README.md', Buffer.from([
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
].join('\n'))]);
if (fs.existsSync(path.join(ROOT, 'LICENSE'))) files.push(['LICENSE', fs.readFileSync(path.join(ROOT, 'LICENSE'))]);

const tmpIndex = path.join(os.tmpdir(), `orca-plugin-index-${process.pid}`);
const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
try {
  git(['read-tree', '--empty'], { env });
  for (const [rel, buf] of files) {
    const sha = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: ROOT, input: buf, encoding: 'utf8' }).trim();
    git(['update-index', '--add', '--cacheinfo', `100644,${sha},${rel}`], { env });
  }
  const tree = git(['write-tree'], { env });
  let parent = null;
  try { parent = git(['rev-parse', '-q', '--verify', `refs/heads/${BRANCH}`]); } catch {}
  const commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `plugin: v${version}`]);
  git(['update-ref', `refs/heads/${BRANCH}`, commit, ...(parent ? [parent] : [])]);
  git(['tag', '-a', TAG, commit, '-m', `Orca 外掛語言包 v${version}`]);

  const listed = git(['ls-tree', '-r', '--name-only', BRANCH]).split('\n');
  console.log(`\n✅ ${BRANCH} 分支已更新並打上 ${TAG}（尚未 push），內容：`);
  for (const f of listed) console.log('   ' + f);
  if (!listed.includes('orca-plugin.json')) { console.error('❌ 根目錄沒有 orca-plugin.json'); process.exit(1); }
  console.log(`\n   推送：git push origin ${BRANCH} ${TAG}`);
} finally {
  try { fs.unlinkSync(tmpIndex); } catch {}
}

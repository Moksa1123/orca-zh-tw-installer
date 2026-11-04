#!/usr/bin/env node
// 比對 Orca 兩個 release tag 的英文原文（src/renderer/src/i18n/locales/en.json），
// 列出新增、移除、英文改過的鍵。只看「缺哪些鍵」會漏掉英文改過的鍵——
// 鍵沒變但原文改了，舊譯文就悄悄過期（例如原文加了 {{host}}，譯文卻沒有）。
//
// 用法： node scripts/diff-upstream.js <舊 tag> <新 tag> [--json 輸出.json]
// 例：   node scripts/diff-upstream.js v1.4.224 v1.4.237 --json .upstream-diff.json
// 需要已登入的 gh CLI。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [FROM, TO] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const JSON_OUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
if (!FROM || !TO) {
  console.error('用法: node scripts/diff-upstream.js <舊 tag> <新 tag> [--json 輸出.json]');
  process.exit(1);
}

const REPO = 'stablyai/orca';
const EN_PATH = 'src/renderer/src/i18n/locales/en.json';

function fetchEn(tag) {
  const raw = execFileSync('gh', ['api', `repos/${REPO}/contents/${EN_PATH}?ref=${tag}`,
    '-H', 'Accept: application/vnd.github.raw'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return flatten(JSON.parse(raw));
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const oldEn = fetchEn(FROM);
const newEn = fetchEn(TO);
const zh = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'orca_zh_TW_translation.json'), 'utf8'));

const added = Object.keys(newEn).filter(k => !(k in oldEn)).sort();
const removed = Object.keys(oldEn).filter(k => !(k in newEn)).sort();
const changed = Object.keys(newEn).filter(k => k in oldEn && oldEn[k] !== newEn[k]).sort();
// 字典裡還沒有、但新版存在的鍵（含先前版本就漏掉的）
const untranslated = Object.keys(newEn).filter(k => !(k in zh)).sort();

console.log(`${FROM} → ${TO}`);
console.log(`  新增 ${added.length}・移除 ${removed.length}・英文改過 ${changed.length}`);
console.log(`  字典尚未翻譯（以 ${TO} 為準）：${untranslated.length}`);

if (changed.length) {
  console.log('\n英文改過的鍵（譯文需人工複查）：');
  for (const k of changed) {
    console.log(`\n  ${k}`);
    console.log(`    舊：${oldEn[k]}`);
    console.log(`    新：${newEn[k]}`);
    console.log(`    譯：${k in zh ? zh[k] : '（未翻譯）'}`);
  }
}

if (JSON_OUT) {
  const result = {
    from: FROM, to: TO,
    added: Object.fromEntries(added.map(k => [k, newEn[k]])),
    removed,
    changed: Object.fromEntries(changed.map(k => [k, { old: oldEn[k], new: newEn[k], zh: zh[k] ?? null }])),
    untranslated: Object.fromEntries(untranslated.map(k => [k, newEn[k]]))
  };
  fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(`\n✅ 已寫入 ${JSON_OUT}`);
}

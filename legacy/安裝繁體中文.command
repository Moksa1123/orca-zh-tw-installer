#!/bin/bash
# macOS 可雙擊執行。Finder 會用 Terminal 開啟 .command 檔。
cd "$(dirname "$0")"

echo
echo "  ============================================"
echo "    Orca 台灣繁體中文語言包"
echo "  ============================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "  [X] 找不到 Node.js"
  echo
  echo "      這個語言包需要 Node.js 才能執行。"
  echo "      請先到 https://nodejs.org/ 下載安裝（選 LTS 版本）。"
  echo
  read -n 1 -s -r -p "  按任意鍵關閉..."
  exit 1
fi

if pgrep -x Orca >/dev/null 2>&1; then
  echo "  [!] 偵測到 Orca 正在執行"
  echo
  echo "      請先完全關閉 Orca（選單列 Orca → Quit Orca）。"
  echo
  read -n 1 -s -r -p "  關閉後按任意鍵繼續..."
  echo
fi

echo "  正在安裝，請稍候（約 1 分鐘）..."
echo
npx --yes orca-zh-tw-installer

echo
echo "  安裝流程結束。若上方顯示成功，請："
echo "    1. 重新啟動 Orca"
echo "    2. Settings → Appearance → Language"
echo "    3. 選擇「中文（繁體）」"
echo
read -n 1 -s -r -p "  按任意鍵關閉..."

@echo off
chcp 65001 >nul
title Orca 繁體中文語言包

echo.
echo  ============================================
echo    Orca 台灣繁體中文語言包
echo  ============================================
echo.

REM 先確認有 Node.js。沒有的話直接給下載連結，
REM 不要讓使用者看到一句看不懂的 'npx' is not recognized。
where node >nul 2>nul
if errorlevel 1 (
  echo  [X] 找不到 Node.js
  echo.
  echo      這個語言包需要 Node.js 才能執行。
  echo      請先到以下網址下載安裝 ^(選 LTS 版本^)：
  echo.
  echo        https://nodejs.org/
  echo.
  echo      安裝完成後，重新執行這個檔案即可。
  echo.
  pause
  exit /b 1
)

REM Orca 執行中會讓安裝失敗，先提醒。
tasklist 2>nul | find /I "Orca.exe" >nul
if not errorlevel 1 (
  echo  [!] 偵測到 Orca 正在執行
  echo.
  echo      請先完全關閉 Orca：
  echo      系統匣 ^(右下角^) 的 Orca 圖示按右鍵 -^> Quit
  echo      ^(只關閉視窗不夠，程式還在背景執行^)
  echo.
  echo      關閉後按任意鍵繼續，或直接關掉這個視窗。
  echo.
  pause
)

echo  正在安裝，請稍候 ^(約 1 分鐘^)...
echo.
call npx --yes orca-zh-tw-installer

echo.
echo  ============================================
echo.
echo   安裝流程結束。若上方顯示成功，請：
echo     1. 重新啟動 Orca
echo     2. Settings -^> Appearance -^> Language
echo     3. 選擇「中文（繁體）」
echo.
pause

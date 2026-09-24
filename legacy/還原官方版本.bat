@echo off
chcp 65001 >nul
title Orca 還原官方版本

echo.
echo  ============================================
echo    還原 Orca 官方版本 ^(介面變回英文^)
echo  ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [X] 找不到 Node.js，無法執行還原。
  echo      請到 https://nodejs.org/ 安裝後再試。
  echo.
  pause
  exit /b 1
)

tasklist 2>nul | find /I "Orca.exe" >nul
if not errorlevel 1 (
  echo  [!] 偵測到 Orca 正在執行
  echo.
  echo      請先完全關閉 Orca：
  echo      系統匣 ^(右下角^) 的 Orca 圖示按右鍵 -^> Quit
  echo.
  echo      關閉後按任意鍵繼續，或直接關掉這個視窗。
  echo.
  pause
)

call npx --yes orca-zh-tw-installer --restore

echo.
echo  還原流程結束。請重新啟動 Orca。
echo.
pause

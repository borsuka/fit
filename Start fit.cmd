@echo off
rem Double-click to start the app. Everything else is handled by the launcher:
rem Docker, the database, the configuration and the app window.
rem
rem Keep this window open - closing it stops the app.
title fit
cd /d "%~dp0"
node scripts\launch.mjs %*
if errorlevel 1 (
  echo.
  echo Something went wrong. The message above says what.
  pause
)

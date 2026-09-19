@echo off
rem Double-click to shut the database down. The app itself stops when you close
rem its window; this frees the memory Docker was holding.
title fit - stopping
cd /d "%~dp0"
echo Stopping the local database...
call npx supabase stop
echo.
echo Stopped. Run "Start fit" when you want it back.
timeout /t 5 >nul

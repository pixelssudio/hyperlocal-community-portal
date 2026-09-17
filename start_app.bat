@echo off
title Rawatbhata Hyperlocal Platform
cd /d "%~dp0"
echo ===================================================
echo 🚀 Launching Rawatbhata Hyperlocal Web Application
echo 🌐 http://localhost:3000
echo ===================================================
node node_modules\next\dist\bin\next dev -p 3000
pause

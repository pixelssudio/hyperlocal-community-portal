@echo off
TITLE Rawatbhata Direct - Android App Launcher & APK Packager
color 0E

echo ==============================================================================
echo        RAWATBHATA HYPERLOCAL PLATFORM (323303) - ANDROID DEPLOYMENT
echo ==============================================================================
echo.
echo  [1] Launch Production Web Server (Local Network & Android Access)
echo  [2] Run 100%% Android PWA & Security Audit Suite
echo  [3] Build Fresh Production Release Bundle (next build)
echo  [4] View 2-Minute Android Installation Guide (Install on Phone)
echo  [5] Exit
echo.
echo ==============================================================================
set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" goto launch_prod
if "%choice%"=="2" goto run_audit
if "%choice%"=="3" goto run_build
if "%choice%"=="4" goto show_guide
if "%choice%"=="5" goto end

:launch_prod
echo.
echo [*] Starting Rawatbhata Direct Production Server on Port 3000...
echo [*] Connect your Android Phone to the same Wi-Fi and open your PC's IP address:
echo     e.g., http://192.168.1.X:3000
echo.
node node_modules/next/dist/bin/next start -p 3000
goto end

:run_audit
echo.
echo [*] Executing Full PWA, Security, Payment & WhatsApp Verification Suite...
node scripts/verify_production.mjs
pause
goto end

:run_build
echo.
echo [*] Building Production Optimized Next.js App...
node node_modules/next/dist/bin/next build
echo.
echo [*] Running Automated Verification...
node scripts/verify_production.mjs
pause
goto end

:show_guide
cls
echo ==============================================================================
echo               HOW TO INSTALL DIRECTLY ON YOUR ANDROID PHONE
echo ==============================================================================
echo.
echo  METHOD A: 1-CLICK INSTANT PWA (NO COMPUTER CONNECT REQUIRED)
echo  -------------------------------------------------------------
echo  1. Make sure your Android phone is connected to the same Wi-Fi.
echo  2. Open Chrome on your Android phone and navigate to your PC's IP or public URL:
echo     http://[YOUR-PC-IP]:3000
echo  3. Tap the 3-dots menu in Chrome -> Tap "Add to Home screen" or "Install App".
echo  4. The "Rawatbhata Direct" App Icon will appear on your Android Home Screen!
echo.
echo  METHOD B: SIGNED ANDROID APK (.APK / .AAB) VIA PWABUILDER
echo  -------------------------------------------------------------
echo  1. Deploy or tunnel your port using ngrok (e.g. ngrok http 3000).
echo  2. Visit https://www.pwabuilder.com on your PC browser.
echo  3. Enter your URL and click "Package for Stores" -> Select Android.
echo  4. Download your signed APK and sideload it directly onto your Android device!
echo.
echo ==============================================================================
pause
goto end

:end
echo.
echo Thank you for using Rawatbhata Hyperlocal Platform!

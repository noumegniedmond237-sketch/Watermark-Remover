@echo off
echo D?marrage du serveur web local pour Clear AI Watermark...
echo.

REM Try Python 3 first
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Python d?tect?. D?marrage du serveur sur http://localhost:8000
    echo Appuyez sur Ctrl+C pour arr?ter le serveur.
    echo.
    start http://localhost:8000
    python -m http.server 8000
    pause
    exit /b
)

REM Try Node.js if Python is not available
node --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Node.js d?tect?. D?marrage du serveur avec npx serve...
    echo Appuyez sur Ctrl+C pour arr?ter le serveur.
    echo.
    start http://localhost:3000
    npx serve .
    pause
    exit /b
)

echo ERREUR : Ni Python ni Node.js n'ont ?t? trouv?s sur votre syst?me.
echo Cette application n?cessite un serveur web local pour fonctionner (utilisation de Web Modules).
echo Veuillez installer Python (https://www.python.org/downloads/) ou Node.js (https://nodejs.org/).
echo.
pause


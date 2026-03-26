@echo off
chcp 65001 >nul
echo Demarrage du serveur web local pour Clear AI Watermark...
echo.

REM Essayer Python 3 en premier
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Python detecte. Demarrage du serveur sur http://localhost:8000
    echo Appuyez sur Ctrl+C pour arreter le serveur.
    echo.
    start http://localhost:8000
    python -m http.server 8000
    pause
    exit /b
)

REM Essayer Node.js si Python n'est pas disponible
node --version >nul 2>&1
if %errorlevel% equ 0 (
    echo Node.js detecte. Demarrage du serveur avec npx serve...
    echo Appuyez sur Ctrl+C pour arreter le serveur.
    echo.
    start http://localhost:3000
    npx serve .
    pause
    exit /b
)

echo ERREUR : Ni Python ni Node.js n'ont ete trouves sur votre systeme.
echo Cette application necessite un serveur web local pour fonctionner (utilisation de Web Modules).
echo Veuillez installer Python (https://www.python.org/downloads/) ou Node.js (https://nodejs.org/).
echo.
pause

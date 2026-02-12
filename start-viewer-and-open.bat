@echo off
REM ========================================
REM OpenCode Log Viewer - Lanceur avec ouverture automatique du navigateur
REM ========================================

echo.
echo ========================================
echo   OpenCode Log Viewer
echo ========================================
echo.

REM Vérifier si Python est installé
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Python n'est pas installe ou n'est pas dans le PATH
    echo.
    echo Veuillez installer Python depuis : https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo [OK] Python detecte
python --version
echo.

REM Se déplacer dans le répertoire du script
cd /d "%~dp0"

echo [INFO] Demarrage du serveur HTTP sur le port 8080...
echo.

REM Ouvrir le navigateur après 2 secondes
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8080"

echo ========================================
echo   Application disponible sur :
echo   http://localhost:8080
echo ========================================
echo.
echo Le navigateur va s'ouvrir automatiquement...
echo.
echo Appuyez sur Ctrl+C pour arreter le serveur
echo.

REM Démarrer le serveur HTTP Python
python -m http.server 8080

pause

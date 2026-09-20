@echo off
setlocal
cd /d "%~dp0"
set "REMOTE="
set "BRANCH="
set "DIRTY="

where git >nul 2>&1
if errorlevel 1 (
  echo.
  echo Git wurde nicht gefunden. Es wurde nichts geaendert.
  start "" "%~dp0lantern\GIT-UPDATE-ANLEITUNG.html"
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo.
  echo Dieser Ordner ist nicht mit dem offiziellen Lantern-Projekt verbunden.
  echo Es wurde nichts geaendert.
  start "" "%~dp0lantern\GIT-UPDATE-ANLEITUNG.html"
  pause
  exit /b 1
)

for /f "usebackq delims=" %%R in (`git remote get-url origin`) do set "REMOTE=%%R"
if /I not "%REMOTE%"=="https://github.com/generallennart/Lantern.git" (
  echo.
  echo Die eingetragene Update-Adresse ist nicht das offizielle Lantern-Projekt.
  echo Zur Sicherheit wurde nichts heruntergeladen.
  start "" "%~dp0lantern\GIT-UPDATE-ANLEITUNG.html"
  pause
  exit /b 1
)

for /f "usebackq delims=" %%B in (`git branch --show-current`) do set "BRANCH=%%B"
if /I not "%BRANCH%"=="main" (
  echo.
  echo Lantern ist nicht auf dem sicheren Hauptzweig main.
  echo Zur Sicherheit wurde nichts heruntergeladen.
  start "" "%~dp0lantern\GIT-UPDATE-ANLEITUNG.html"
  pause
  exit /b 1
)

for /f "usebackq delims=" %%C in (`git status --porcelain`) do set "DIRTY=1"
if defined DIRTY (
  echo.
  echo Es gibt eigene Aenderungen oder zusaetzliche Dateien im Lantern-Ordner.
  echo Sie wurden nicht ueberschrieben.
  start "" "%~dp0lantern\GIT-UPDATE-ANLEITUNG.html"
  pause
  exit /b 1
)

echo.
echo Es werden nur neue Dateien aus dem offiziellen Lantern-Projekt geholt.
echo Eigene Aenderungen werden nicht ueberschrieben.
git pull --ff-only origin main
if errorlevel 1 (
  echo.
  echo Das Update wurde nicht eingespielt. Wahrscheinlich gibt es eigene Aenderungen im Ordner.
  echo Es wurde nichts ueberschrieben. Die Anleitung erklaert die naechsten Schritte.
  start "" "%~dp0lantern\GIT-UPDATE-ANLEITUNG.html"
  pause
  exit /b 1
)

start "" "chrome://extensions/"
start "" "%~dp0lantern\GIT-UPDATE-ANLEITUNG.html"
echo.
echo Die Dateien sind aktuell. Klicke in Chrome bei Lantern noch auf den Kreis-Pfeil zum Neu laden.
pause

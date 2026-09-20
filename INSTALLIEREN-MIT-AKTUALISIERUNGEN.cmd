@echo off
setlocal

set "REPOSITORY=https://github.com/generallennart/Lantern.git"
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('MyDocuments')"`) do set "TARGET=%%D\Lantern"
if not defined TARGET set "TARGET=%USERPROFILE%\Documents\Lantern"

where git >nul 2>&1
if errorlevel 1 (
  echo.
  echo Git fehlt noch. Es ist kostenlos und braucht kein GitHub-Konto.
  echo Es wird nur benoetigt, um Lantern aus dem offiziellen Projekt zu holen.
  start "" "https://git-scm.com/download/win"
  start "" "%~dp0lantern\GIT-UPDATE-ANLEITUNG.html"
  echo.
  echo Installiere Git, lasse alle Voreinstellungen so wie sie sind und starte diese Datei danach noch einmal.
  pause
  exit /b 1
)

if exist "%TARGET%\" (
  echo.
  echo In "%TARGET%" liegt schon ein Lantern-Ordner.
  echo Zur Sicherheit wurde nichts ueberschrieben.
  if exist "%TARGET%\lantern\GIT-UPDATE-ANLEITUNG.html" (
    start "" "%TARGET%\lantern\GIT-UPDATE-ANLEITUNG.html"
  ) else (
    start "" "%~dp0lantern\GIT-UPDATE-ANLEITUNG.html"
  )
  pause
  exit /b 1
)

echo.
echo Lantern wird nach "%TARGET%" kopiert.
echo Es wird nur das offizielle, oeffentliche GitHub-Projekt gelesen.
git clone --branch main --single-branch "%REPOSITORY%" "%TARGET%"
if errorlevel 1 (
  echo.
  echo Das Kopieren hat nicht funktioniert. Die Anleitung zeigt die naechsten Schritte.
  start "" "%~dp0lantern\GIT-UPDATE-ANLEITUNG.html"
  pause
  exit /b 1
)

start "" "%TARGET%\ANLEITUNG.html"
start "" "chrome://extensions/"
echo.
echo Fertig. Die Anleitung ist geoeffnet. Dort folgen nur noch die Schritte in Chrome.
pause

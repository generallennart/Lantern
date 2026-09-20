# Lantern 1.0

Lantern ist eine Erweiterung für Chrome und Edge auf ChatGPT, Claude und
Gemini. Sie hilft dabei, aus normalen Worten einen klaren Prompt zu machen.
Lantern drückt nie selbst auf Senden.

`1.0.0` ist die erste echte Veröffentlichung. Alle früheren `1.x.x`-Fassungen
waren Testfassungen und gehören nicht zum öffentlichen Updateweg.

## Einfach installieren

1. Unter **Releases** die ZIP-Datei der aktuellen Version herunterladen.
2. Die ZIP-Datei entpacken.
3. `ANLEITUNG.html` doppelklicken und nur den sieben Schritten dort folgen.

Die Anleitung erklärt auch genau, wie der Ordner `lantern` in Chrome als
Erweiterung geladen wird.

## Einfach aktualisieren

Im Lantern-Menü erscheint ein `!` nur, wenn das offizielle Projekt eine neue
stabile Version kennt. Die Meldung erklärt, warum sie erscheint und was als
Nächstes zu tun ist.

Wer spätere Updates mit einem Doppelklick erledigen möchte, führt einmal
`INSTALLIEREN-MIT-AKTUALISIERUNGEN.cmd` aus dem Paket aus. Das braucht kein
GitHub-Konto und kein Passwort. Auf verwalteten Arbeitsgeräten kann die
Installation von Git oder der Entwicklermodus gesperrt sein; dann bleibt der
ZIP-Weg oder die IT-Abteilung der sichere Weg.

Danach aktualisiert `AKTUALISIEREN.cmd` nur aus
`https://github.com/generallennart/Lantern.git`. Es prüft zuerst die genaue
Adresse, den freigegebenen Hauptzweig und ob eigene Änderungen vorhanden sind. Erst dann
läuft `git pull --ff-only origin main`; eigene Änderungen werden nicht
überschrieben.

Eine lokal geladene Erweiterung darf sich aus Sicherheitsgründen nicht selbst
ersetzen. Vollautomatische Erweiterungsupdates sind erst mit einer zukünftigen
Veröffentlichung im Chrome Web Store möglich.

## Datenschutz und Sicherheit

- Lantern drückt nie selbst auf Senden.
- Prompt-Text, Verlauf und Einstellungen bleiben im Browser.
- Die optionale Versionsprüfung liest höchstens einmal täglich nur die
  öffentliche Versionsnummer dieses Projekts. Sie überträgt keine Chats,
  Prompts, Konten, Cookies, Zugangsdaten oder Lantern-Kennung.
- GitHub sieht dabei normale technische Verbindungsdaten wie bei jedem
  Webseitenaufruf, zum Beispiel eine IP-Adresse.
- Die Erweiterung darf nur auf den unterstützten Chat-Seiten und bei GitHubs
  öffentlicher Release-API arbeiten. Sie liest keine Zugangsdaten.

Mehr Details: [Anleitung](ANLEITUNG.html),
[Update-Anleitung](lantern/GIT-UPDATE-ANLEITUNG.html),
[Erweiterungsdokumentation](lantern/README.md).

## Veröffentlichen

Für Maintainer: [VEROEFFENTLICHEN.txt](VEROEFFENTLICHEN.txt). Ein `vX.Y.Z`-Tag
startet GitHub Actions: prüfen, auditieren, paketieren, hashen und als GitHub
Release veröffentlichen. `main` ist nur für freigegebene Fassungen; laufende
Arbeit gehört auf den Branch `develop`.

## Lizenz

MIT-Lizenz. Siehe [LICENSE](LICENSE).

<details>
<summary>English</summary>

Lantern is a Chrome/Edge extension for ChatGPT, Claude, and Gemini. It helps
turn plain-language requests into clear prompts and never presses Send.

Download the latest ZIP under **Releases**, unzip it, and open
`ANLEITUNG.html`. For easy future updates, run
`INSTALLIEREN-MIT-AKTUALISIERUNGEN.cmd` once; it needs no GitHub account or
password. On managed devices, Git installation or Developer mode may require
IT approval.

Lantern checks the public release version at most once per day, and only shows
`!` for a validated newer stable release. It sends no chat or account content,
but GitHub receives ordinary web connection metadata such as an IP address.
Fully automatic updates require a future Chrome Web Store release.

</details>

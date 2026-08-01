# Changelog

## 2.1.0 — 2026-08-01

### Neu

- **push:** sofortige Zustellung erbitten und Fokus-Hinweis zeigen (93beb53)
- **push:** Benachrichtigungen in der Webversion (e9c6a87)
- **push:** Web-Push im Backend (77a0b3b)
- **web:** Export als Startbildschirm-App installierbar (6bc598d)
- **auth:** dritter Auth-Zustand fuer den Startvorgang (6c5f2ea)
- **auth:** Sitzungswiederherstellung im Client (4d3fe37)
- **retention:** abgelaufene Sitzungen mit aufraeumen (92142b6)
- **auth:** Sitzungsendpunkt, Datenrouten werden Bearer-only (b8c6e57)
- **auth:** Sitzungstabelle und Datenzugriff (fb86e07)
- **auth:** Fristenlogik fuer Anmeldesitzungen (2ce3642)
- **datenschutz:** Patientendaten aus der SQL-Konsole aussperren (6f647e5)
- **retention:** automatisierter Loeschlauf beim Start und taeglich (75544d9)
- **audit:** Protokollierung lesender Zugriffe auf Einsatzprotokolle (459e2f7)
- **retention:** Fristenlogik nach Loeschkonzept mit Tests (7953b43)
- **admin:** owner-only database console with presets and audit trail (ef62a69)
- **reports:** free-text category and measures, body map, emergency contact (afe2480)
- restore incident report (Einsatzprotokoll) feature (94688e2)
- incident report (Einsatzprotokoll) — structured per-mission documentation with PDF export (9c186e3)
- translation glossary for domain terms + i18n Benutzerverwaltung/roles (f527e57)
- notifications fix, Eigentümer label, LOA tabs, calendar fix, auto-translation (9e9d404)
- duty sync, per-user default theme, all-themes access, LOA date picker, newer-first sorting (537c5fc)

### Behoben

- **db:** fehlende Werte im Enum notification_type ergaenzen (16e8ea4)
- **push:** Einsaetze an die Diensthabenden melden (8500f21)
- **push:** Erlaubnis vor Service-Worker-Registrierung abfragen (35bdca8)
- **web:** unbenutzten Platform-Import nach useTopPad-Umstellung entfernen (f07e3ff)
- Nachlauf aus den Reviews (674d96d)
- **auth:** Direktaufruf von Routen umgeht den Guard nicht mehr (98f965f)
- **protokoll:** PDF-Export authentifiziert sich ueber den Header (106937a)
- **web:** dialogs that never fired, silent draft save (464d692)
- **security:** correct console write detection, gate approve, import fs (eb12b7d)
- **admin:** block SELECT INTO in console, widen unbounded-write detection (94d88b2)
- **reports:** hide duplicate router header, rename Walk-in to Protokoll (7514dd7)
- add express-rate-limit to api-server dependencies (3d190f9)
- metro config + .npmrc for pnpm monorepo iOS native builds (6066843)
- replace hardcoded German strings with i18n keys across all screens (5f240f3)
- await translation before responding so items appear translated immediately (8bed6d7)
- i18n News category + status labels (were hardcoded German) (a124f68)
- clean ease-out segment animation (no overshoot) (f4db224)
- security hardening, missions archived crash, animated absence tabs (a0944fd)

### Umbau

- **web:** oberen Abstand an einer Stelle bestimmen (b0f85ab)
- **retention:** Sitzungs-Nachlauffrist zu retentionRules verschieben (808e2c6)

### Betrieb

- verschluesselte taegliche Datensicherung mit Wiederherstellungsprobe (521a0f1)

### Dokumentation

- README fuer das Repository (c372154)

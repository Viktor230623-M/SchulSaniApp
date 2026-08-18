# Store-Listing: SchulSaniApp

Alle Werte zum Eintragen in App Store Connect und Google Play Console. Stand: August 2026.
Dieses Dokument ist Arbeitstand, kein finaler Text — vor dem Einreichen einmal von einem Muttersprachler gegenlesen.

## App Store (iOS)

| Feld | Wert |
|---|---|
| Name | SchulSaniApp |
| Subtitle (30 Zeichen) | DE: „Einsätze. Alarm. Dienstplan." · EN: "Missions. Alerts. Roster." |
| Kategorie | Education |
| Bundle-ID | `com.schulsani.app` |
| Version / Build | aus `app.json` / Release-Skript (`scripts/release.mjs`) |
| Support-URL | `https://demo.schulsaniapp.com/` |
| Marketing-URL | `https://demo.schulsaniapp.com/` |
| Datenschutz-URL | `https://demo.schulsaniapp.com/datenschutz.html` |
| Altersfreigabe | Selbstauskunft: 12+ (Gesundheitsbezug; Inhalte E2E-verschlüsselt, schulisch vermittelt) — vor Einreichung prüfen |
| Icon | ✅ vorhanden: `assets/images/icon.png`, 1024×1024, ohne Alpha |

**Beschreibung (DE):**
> Die App für den Schulsanitätsdienst an deiner Schule. Einsätze werden direkt am Handy protokolliert und als PDF exportiert. Sanitäter:innen werden per Push alarmiert statt über eine Durchsage. Dienstplan, Vertretung und Abwesenheiten laufen in derselben App.
>
> Einsatzprotokolle werden auf dem Gerät verschlüsselt, bevor sie den Server erreichen — der Betreiber kann den Inhalt nie lesen. Die Schule bleibt datenschutzrechtlich Verantwortliche, der Betreiber ist Auftragsverarbeiter. Keine Werbung, keine Tracker.

**Beschreibung (EN):**
> The app for your school's first-aid service. Responders document missions on their phone and export them as PDF. Alerts arrive as push notifications instead of PA announcements. Rosters, cover and leave management live in the same app.
>
> Incident reports are encrypted on the device before they reach the server — the operator can never read their content. The school stays the data controller; the operator acts as processor. No ads, no trackers.

**Keywords (100 Zeichen, EN):** `schulsanitäter, sanitätsdienst, erste hilfe, schule, einsatzprotokoll, dienstplan, notfall, hamburg`

## Screenshots (DE + EN, je 6.9" und 6.5")

Reihenfolge, aus dem nativen Build aufnehmen (nicht aus dem Web-Export):
1. Alarm-Übersicht (Missionen) mit offenem Einsatz
2. Einsatzprotokoll-Formular (Metadaten sichtbar, Patientendaten unkenntlich/demo)
3. Dienstplan mit Schicht und Mitgliedern
4. Abwesenheiten-Übersicht
5. Benachrichtigungen / Alarm-Eingang
6. Einstellungen mit Themen + Konto

Für Demo-Daten: eigener Screenshot-Tenant mit festen Dummy-Namen verwenden; niemals echte Namen.

## Review Notes (App Store)

```
Die App ist für Schulsanitätsdienste an Schulen. Jede Schule ist eine eigene Instanz;
der Zugang läuft über die Schule (Schul-Code + Freischaltung durch die Schulleitung).

Demo-Zugang für den Review:
- Instanz: https://demo.schulsaniapp.com (Web) bzw. App mit Demo-Build
- Account: siehe beigelegte Review-Zugangsdaten (Schul-Code und Konto werden
  vor Einreichung frisch angelegt und in den Review Notes hinterlegt)

Hinweise:
- Einsatzprotokolle sind Ende-zu-Ende verschlüsselt; Inhalte sind serverseitig nie lesbar.
- Konten lassen sich in Einstellungen → „Konto löschen" selbst entfernen.
- Es gibt keine In-App-Käufe; die Schule schließt den Vertrag außerhalb des Stores.
- Keine Werbung, keine Tracker.
```

## Google Play (Android)

| Feld | Wert |
|---|---|
| Titel | SchulSaniApp |
| Kurzbeschreibung (80 Z.) | „Einsätze protokollieren, Alarm per Push, Dienstplan — für Schulsanitätsdienste." |
| Vollbeschreibung | wie App-Store-Text (DE + EN) |
| Kategorie | Education |
| Package | `com.schulsani.app` |
| Icon | 512×512 (aus 1024er ableiten) |
| Feature-Graphic | 1024×500, markengrün, Logo + Name (noch zu erstellen) |
| Datenschutzerklärung | `https://demo.schulsaniapp.com/datenschutz.html` |
| Altersfreigabe (IARC) | Fragebogen ausfüllen (Gesundheitsbezug) |
| Data-Safety-Form | Kontaktinfos, IDs, Gesundheitsdaten (verschlüsselt, nicht geteilt, keine Erhebung für Werbung) |

## Noch offen

- Screenshots (nach erstem nativen Build, #78)
- Feature-Graphic für Play
- Altersfreigabe-Fragebögen final ausfüllen
- Review-Zugangsdaten frisch anlegen und in Review Notes hinterlegen

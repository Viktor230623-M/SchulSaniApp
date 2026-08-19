# Demo SchulSaniApp — 20-Minuten-Ablauf (Zoom)

**Termin:** Do 20.08.2026, 14:00 Uhr · Gymnasium Othmarschen (Frau Böhner)
**Zugang für sie:** https://demo.schulsaniapp.com — kein Login, startet direkt eingeloggt.
**Zugang für dich (Test-Konto):** dieselbe URL. Alles läuft mit Demo-Daten ohne Server.
**Hilfsmittel:** Bildschirm teilen (App im Browser), dieses Skript als Leitfaden.

---

## Aufbau (2 Min)

- Kurz vorstellen: Schüler am Gymnasium Blankenese, App seit März 2026 in Entwicklung (~5 Monate), 82.000 Zeilen Code, 132 automatisierte Tests (davon 2 Integrationstests für Mandantentrennung).
- Rahmen: "Ich zeige Ihnen in 20 Minuten den kompletten Ablauf — vom Einsatz bis zur Ablage. Sie sehen alles live, keine Anmeldung nötig."
- Wichtigster Satz: "Ihre Schule bleibt datenschutzrechtlich Verantwortliche, ich bin Auftragsverarbeiter mit Vertrag nach Art. 28 DSGVO."

## 1. Das Problem (1 Min)

- Heute: Papierprotokoll, Durchsage über Lautsprecher, Dienstplan in Excel, wer kommt weiß keiner.
- Die App ersetzt das: ein Ort für Alarm, Protokoll, Plan und Ablage.

## 2. Alarmierung — Benachrichtigungen (3 Min)

**Route:** Tab „Benachrichtigungen" (2 ungelesen)
- Zeigen: Einsatz-Meldung „Kreislaufprobleme, Flur 2. OG", Priorität hoch.
- Erklären: Push-Nachricht statt Durchsage. Handy vibriert auch im Unterricht (lautlos wird überschrieben — technischer Hinweis: auf Android hoch priorisiert, iOS-Beschränkung kurz erwähnen, nicht vertiefen).
- Zeigen: „Alle gelesen" — Status pro Meldung.

**Sprechzettel:** „Statt Durchsage im Lautsprecher bekommt jeder Sanitäter eine Push-Nachricht aufs Handy — auch wenn es klingelt oder vibriert. Kein Verpassen mehr, kein 'Wer hat das gehört?'"

## 3. Der Einsatz — annehmen & Protokoll (5 Min)

**Route:** Tab „Einsätze"
- Einsatz öffnen, „Annehmen" klicken → Status wechselt auf übernommen, Name des Sanitäters wird zugeordnet.
- In den Einsatz → „Protokoll" öffnen (oder Tab „Protokolle"):
  - Zeigen: Kopfverletzung (Entwurf), Nasenbluten (eingereicht).
  - Felder zeigen: Ort, Klasse, betroffene Person, Puls/Blutdruck, Maßnahmen, Verlauf.
- Erklären: wird am Handy ausgefüllt, kein Zettel, keine Zweitschrift, nichts geht verloren.

**Sprechzettel:** „Das Protokoll entsteht direkt am Ort des Geschehens. Am Ende wird es als PDF exportiert — das ist dann Ihre Dokumentation, die Sie gesetzlich ohnehin führen müssen."

## 4. PDF-Export & Ablage (2 Min)

- Protokoll → „Als PDF exportieren" zeigen (in der Live-Demo der Button im Protokoll; falls im Demo-Modus deaktiviert, kurz erklären: funktioniert im echten Betrieb, Export bündelt alle Protokolle).
- Erklären Ablage-Modell: Schule bekommt Protokolle als PDF-Bündel (halbjährlich/jährlich/nach 5 Jahren — die Schule wählt), nach Download werden die Daten bei mir gelöscht. Server in Frankfurt/EU.

## 5. Dienstplan & Vertretung (3 Min)

**Route:** Tab „Dienstplan"
- Schichten zeigen, „Beitreten" klicken → Name erscheint in der Besetzung.
- Kurz: Abwesenheiten-Tab (krank/verhindert) → Vertretung sichtbar.

**Sprechzettel:** „Wer wann Dienst hat, wer einspringt, wer abwesend ist — alles in einer App. Kein getrenntes Excel mehr."

## 6. Rollen & Verwaltung (2 Min)

- Erklären: Schulsanitäter, Leitung, Lehrkraft, Admin — jede Rolle sieht nur, was sie darf.
- Admin-Bereich kurz andeuten (Protokoll-Freigabe, Rollen, Aktivitäten), nicht vertiefen.

## 7. Datenschutz (2 Min) — der wichtigste Teil

- Schule = Verantwortliche, ich = Auftragsverarbeiter, Art. 28 DSGVO-Vertrag.
- Server in der EU (Frankfurt), Daten nach Download bei mir gelöscht.
- Self-Hosting möglich: Schule kann die App auf eigenen Servern betreiben, Löschung bleibt aktiv.

## Abschluss (2 Min)

- Angebot wiederholen: Demo kostenlos & unverbindlich (demo.schulsaniapp.com), Preise transparent nennen (gehostet 299 €/Jahr, self-hosted 399 €/Jahr, Setup 149 € einmalig).
- Nächster Schritt vorschlagen: „Ich richte Ihnen einen Test-Zugang mit den Daten Ihrer Schule ein — sagen Sie mir einfach, welche Klasse den Dienst übernehmen soll, oder ob ich Ihnen erst ein Konzept für den Aufbau schicke."
- Offene Frage stellen: „Was ist bei Ihnen der größte Reibungspunkt heute — die Alarmierung, das Protokoll oder der Dienstplan?"

---

## Fallbacks

- **Zoom-Audio/Video bricht ab:** Link in der Mail (us05web.zoom.us/j/81509319080, Kenncode 9tuSJL) erneut senden.
- **Demo-Seite lädt nicht:** Kurz warten, neu laden; alternativ die 4 Screenshots zeigen (landing-site/screens/*.png).
- **Frage, die du nicht beantworten kannst:** „Das prüfe ich und melde mich dazu." Nicht improvisieren.
- **Sie fragt nach Preisen:** „Gehostet 299 Euro pro Jahr, selbst gehostet 399 Euro pro Jahr, dazu einmalig 149 Euro für Setup und Team-Einführung. Die Demo vorher ist kostenlos und unverbindlich."

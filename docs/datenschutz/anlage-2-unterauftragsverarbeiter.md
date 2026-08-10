# Anlage 2 — Unterauftragsverarbeiter

## zum AVV (Modell A und Modell B)

Die nachfolgenden Unterauftragsverarbeiter sind mit vorheriger Genehmigung
des Verantwortlichen eingeschaltet. Der Auftragsverarbeiter informiert den
Verantwortlichen rechtzeitig über beabsichtigte Änderungen (Art. 28 Abs. 3
lit. d DSGVO).

| # | Unterauftragsverarbeiter | Leistung/Zweck | Verarbeitete Daten | Ort der Verarbeitung | Übermittlungsgrundlage bei Drittland |
|---|---|---|---|---|---|
| 1 | **[Hosting-Provider]** (z. B. [Name], [Standort]) | Betrieb der Server- und Datenbankinfrastruktur im Modell A (Hosting, Speicherung, Backups) | alle personenbezogenen Daten, die im Betrieb der Anwendung anfallen; Einsatzprotokoll-Inhalte nur als Chiffrat (E2E-Verschlüsselung) | **[Land / EU / EWR]** | [Innerhalb EU/EWR: kein Drittlandtransfer; sonst: SCCs, Art. 46 DSGVO] |
| 2 | **Google LLC / Firebase** — Firebase Cloud Messaging (FCM) | Zustellung von Push-Benachrichtigungen an Android-Geräte über das zentrale FCM-Konto des Auftragsverarbeiters | Geräte-Tokens (FCM-Token), inhaltsleere Push-Payloads (nur `notificationId`, `type`, `relatedId`), Zustellzeitpunkte | EU und USA | USA: **Angemessenheitsbeschluss „EU–US Data Privacy Framework" (DPF)** für Google LLC (zertifiziert); ergänzend/falls nicht anwendbar: **EU-Standardvertragsklauseln (SCCs)** nach Art. 46 Abs. 2 lit. c DSGVO; technische Zusatzmaßnahmen (inhaltsleere Payloads, Datenminimierung) |
| 3 | **Apple Inc.** — Apple Push Notification Service (APNs) | Zustellung von Push-Benachrichtigungen an iOS-Geräte über das zentrale APNs-Konto des Auftragsverarbeiters | Geräte-Tokens (APNs-Token), inhaltsleere Push-Payloads (nur `notificationId`, `type`, `relatedId`), Zustellzeitpunkte | weltweit, Rechenzentren u. a. in den USA | USA: **EU–US Data Privacy Framework (DPF)** für Apple Inc. (zertifiziert); ergänzend/falls nicht anwendbar: **EU-SCCs**; technische Zusatzmaßnahmen (inhaltsleere Payloads) |

## Erläuterungen

### Google/Firebase Cloud Messaging (FCM)

- **Zweck:** Zustellung von Push-Benachrichtigungen an die
  Android-Endgeräte der Nutzer:innen. Der Versand erfolgt über das zentrale
  FCM-Konto des Auftragsverarbeiters (nicht über schuleigene Push-Konten).
- **Datenumfang:** minimiert — Geräte-Token und inhaltsleeres Signal; keine
  Klartextinhalte, keine Gesundheitsdaten, keine Namen.
- **Drittland:** Google LLC ist unter dem EU–US Data Privacy Framework
  zertifiziert. Soweit das DPF nicht anwendbar sein sollte (z. B. bei
  Verarbeitungen, die nicht unter die Zertifizierung fallen), werden
  EU-Standardvertragsklauseln geschlossen. Die verbleibenden Risiken werden
  durch die technische Maßnahme der inhaltsleeren Payloads (kein
  Personenbezug in der übermittelten Nachricht) minimiert.

### Apple Push Notification Service (APNs)

- **Zweck:** Zustellung von Push-Benachrichtigungen an die iOS-Geräte der
  Nutzer:innen. Der Versand erfolgt über das zentrale APNs-Konto des
  Auftragsverarbeiters (Apple Developer-Konto des Anbieters).
- **Datenumfang:** minimiert — Geräte-Token und inhaltsleeres Signal; keine
  Klartextinhalte.
- **Drittland:** Apple Inc. ist unter dem EU–US Data Privacy Framework
  zertifiziert; ergänzend EU-SCCs, technische Minimierung durch
  inhaltsleere Payloads.

### Hosting-Provider (nur Modell A)

Der konkrete Hosting-Provider wird vor Vertragsschluss benannt
([Platzhalter]). Die Verarbeitung erfolgt vorzugsweise innerhalb der
EU/des EWR. Sollte ein Drittlandtransfer erforderlich sein, werden
Standardvertragsklauseln geschlossen und technische Zusatzmaßnahmen
dokumentiert. Aufgrund der Ende-zu-Ende-Verschlüsselung liegen beim
Hosting-Provider für Einsatzprotokolle ausschließlich Chiffrate vor.

### Keine weiteren Unterauftragsverarbeiter

Weitere Dienste mit Zugriff auf personenbezogene Daten werden nicht
eingesetzt. Externe Dienste ohne Personenbezug (z. B. reine Infrastruktur)
sind hiervon unberührt und werden dem Verantwortlichen auf Anfrage
benannt.

## Hinweis zur Drittland-Minimierung

Die Push-Payloads werden bewusst inhaltsleer gehalten (kein Personenbezug
in der Nachricht), um das mit jedem Drittlandtransfer verbundene Risiko
auf ein Minimum zu reduzieren. Details: Anlage 1, Ziffer 1.4, sowie das
Dokument „Datenschutz-Dokumentation", Abschnitt „Hinweis: inhaltsleere
Push-Payloads".

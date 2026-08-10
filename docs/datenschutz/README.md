# Datenschutz-Dokumentation SchulSaniApp

Dieser Ordner enthält die DSGVO-Dokumentation für die SchulSaniApp
(Sanitätsdienst-App für Schulen). Die Dokumente sind in formeller
Vertragssprache gehalten; alle variablen Angaben (Betreiber, Schule,
Hosting-Anbieter) stehen in eckigen Klammern `[Platzhalter]` und sind vor
Verwendung auszufüllen.

## Betriebsmodelle

Die Dokumentation deckt zwei Betriebsmodelle ab:

| Modell | Beschreibung | Verantwortlicher | Auftragsverarbeiter |
|---|---|---|---|
| **A – Anbieter hostet** | Der Anbieter betreibt Server und Datenbank für die Schule. | Schule | Anbieter (vollständiger AVV nach Art. 28 Abs. 3 DSGVO) |
| **B – Schule hostet selbst** | App und Datenbank laufen auf dem Schulserver. Der Anbieter verarbeitet nur noch Push-Daten (Geräte-Tokens, Alarmierungs-Zeitpunkte) über seine zentralen FCM-/APNs-Konten. | Schule | Anbieter (auf die Push-Verarbeitung beschränkter AVV) |

In **beiden** Modellen verarbeitet der Anbieter mindestens Push-Daten über
seine zentralen Firebase-Cloud-Messaging- (FCM) und Apple-Push-Notification-
(APNs) Konten. Ein AVV ist daher in beiden Fällen erforderlich. Native
Push-Benachrichtigungen laufen ausschließlich über diese zentralen Konten des
Anbieters; eine Abhängigkeit von Expo Push oder schuleigenen Push-Konten
besteht nicht.

## Dokumente

| Dokument | Inhalt |
|---|---|
| [avv-modell-a.md](avv-modell-a.md) | Auftragsverarbeitungsvertrag nach Art. 28 Abs. 3 DSGVO (Modell A, vollständig) |
| [avv-modell-b-push.md](avv-modell-b-push.md) | Auf die Push-Verarbeitung beschränkter AVV (Modell B) |
| [anlage-1-tom.md](anlage-1-tom.md) | Technische und organisatorische Maßnahmen (Art. 32 DSGVO) |
| [anlage-2-unterauftragsverarbeiter.md](anlage-2-unterauftragsverarbeiter.md) | Unterauftragsverarbeiter, Übermittlungsorte und Rechtsgrundlagen |
| [anlage-3-datenkategorien.md](anlage-3-datenkategorien.md) | Datenkategorien, Betroffenenkategorien, Zwecke und Speicherfristen |

## Ende-zu-Ende-Verschlüsselung

Kernstück des technischen Konzepts ist die Ende-zu-Ende-Verschlüsselung der
Einsatzprotokolle: Der Anbieter-Server kann Gesundheitsinhalte (Art. 9 DSGVO)
technisch nie im Klartext lesen. Das vollständige Konzept ist in
[anlage-1-tom.md](anlage-1-tom.md) beschrieben; die technische Umsetzung im
Code folgt exakt diesem Konzept.

## Hinweis: inhaltsleere Push-Payloads (Drittland-Minimierung)

FCM (Google) und APNs (Apple) verarbeiten Push-Zustellung als
Unterauftragsverarbeiter, teilweise mit Verarbeitung in Drittländern
(vor allem die USA). Um das Risiko einer Übermittlung personenbezogener
Inhalte über diese Dienste zu minimieren, gilt verbindlich:

- **Push-Payloads enthalten keinen Personenbezug.** Gesendet wird nur ein
  inhaltsleeres Signal („Neue Meldung") zusammen mit technischen
  Bezeichnern (`notificationId`, `type`, `relatedId`), die ohne
  Serverzugriff keinen Rückschluss auf Personen oder Gesundheitsdaten
  zulassen.
- Der vollständige Inhalt (auch der Anzeigetext) wird erst von der App
  nach dem Antippen aus der verschlüsselten API geladen und lokal
  entschlüsselt.
- Über FCM/APNs gehen damit ausschließlich: Geräte-Tokens und das
  inhaltsleere Signal. Dies wird in [anlage-2-unterauftragsverarbeiter.md](anlage-2-unterauftragsverarbeiter.md)
  und [anlage-1-tom.md](anlage-1-tom.md) als Maßnahme der
  Datenminimierung und Drittland-Minimierung ausgewiesen.

## Pflege

Diese Dokumente beschreiben den Zustand des Codes. Ändert sich der Code
(hinzu kommende Datenfelder, neue Verarbeitungen, neue Dienste), sind die
Dokumente mitzuführen. Insbesondere sind neue personenbezogene Felder im
Schema in [anlage-3-datenkategorien.md](anlage-3-datenkategorien.md) zu
ergänzen und neue Dienste in
[anlage-2-unterauftragsverarbeiter.md](anlage-2-unterauftragsverarbeiter.md).

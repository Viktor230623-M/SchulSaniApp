# Auftragsverarbeitungsvertrag (AVV)

## nach Art. 28 Abs. 3 DSGVO — Modell B (Schule hostet selbst; auf die Push-Verarbeitung beschränkter AVV)

**Zwischen**

**[Name der Schule]** — nachfolgend „Verantwortlicher" —
vertreten durch **[Name, Funktion]**, [Adresse der Schule], [E-Mail der Schule],

**und**

**[Name des Anbieters]** — nachfolgend „Auftragsverarbeiter" —
vertreten durch **[Name, Funktion]**, [Adresse des Anbieters], [E-Mail des Anbieters].

---

## § 1 Gegenstand und Dauer

1. Im Betriebsmodell B betreibt der Verantwortliche die Anwendung
   **SchulSaniApp** (Server, Datenbank und Client-Anwendung) auf eigener
   Infrastruktur (Schulserver). Der Verantwortliche ist insoweit zugleich
   technischer Betreiber.

2. Der Auftragsverarbeiter erbringt ausschließlich folgende Leistung
   (der „Vertragsgegenstand"): die **Übermittlung von
   Push-Benachrichtigungen** an die Endgeräte der Nutzer:innen über die
   zentralen Firebase-Cloud-Messaging- (FCM) und Apple-Push-Notification-
   (APNs) Konten des Auftragsverarbeiters. Hierfür verarbeitet der
   Auftragsverarbeiter ausschließlich die in § 3 genannten Daten.

3. Dieser AVV ist auf die vorgenannte Push-Verarbeitung **beschränkt**.
   Alle übrigen Verarbeitungen personenbezogener Daten (insbesondere
   Einsatzprotokolle, Gesundheitsdaten, Konten, Dienstplan) erfolgen
   vollständig in der Infrastruktur des Verantwortlichen und unterliegen
   nicht der Verarbeitung durch den Auftragsverarbeiter. Aufgrund der
   Ende-zu-Ende-Verschlüsselung der Einsatzprotokolle (Anlage 1 zum
   Hauptvertrag) ist der Auftragsverarbeiter auch technisch nicht in der
   Lage, auf die Inhalte zuzugreifen.

4. Gegenstand und Dauer richten sich nach dem Hauptvertrag; dieser AVV
   endet mit dessen Beendigung, spätestens mit der Löschung der in § 5
   genannten Daten.

## § 2 Art, Umfang und Zweck der Verarbeitung

1. Der Auftragsverarbeiter verarbeitet personenbezogene Daten ausschließlich
   auf dokumentierte Weisung des Verantwortlichen und ausschließlich zum
   Zweck der Zustellung von Push-Benachrichtigungen an die Geräte der
   Nutzer:innen der Anwendung. Eine Verarbeitung für eigene Zwecke ist
   untersagt.

2. Die Push-Nachrichten werden bewusst **inhaltsleer** gehalten: Übermittelt
   wird nur ein neutrales Signal („Neue Meldung") zusammen mit technischen
   Bezeichnern (`notificationId`, `type`, `relatedId`), die ohne Zugriff auf
   die Datenbank des Verantwortlichen keinen Personenbezug und keinen
   Rückschluss auf Inhalte erlauben. Der vollständige Inhalt wird erst von
   der App auf dem Endgerät aus der Anwendung des Verantwortlichen geladen
   und lokal entschlüsselt. Diese Datenminimierung ist Bestandteil der
   Weisung des Verantwortlichen.

## § 3 Art der Daten und Kategorien Betroffener

1. Verarbeitet werden ausschließlich:
   - **Geräte-Tokens** der Endgeräte (FCM-Token für Android, APNs-Token für
     iOS, Web-Push-Subscription für Browser), die zur Adressierung der
     Zustellung erforderlich sind;
   - **Alarmierungs-Zeitpunkte** und Versandmetadaten (wann eine
     Benachrichtigung zugestellt wurde);
   - technische Bezeichner der Benachrichtigung (`notificationId`, `type`,
     `relatedId`).

2. **Keinerlei weitere personenbezogene Daten** (insbesondere keine
   Gesundheitsdaten, keine Namen, keine Protokollinhalte) werden an den
   Auftragsverarbeiter übermittelt oder von ihm verarbeitet.

3. Betroffenenkategorien: die Nutzer:innen der Anwendung, darunter
   minderjährige Schulsanitäter:innen. Gesundheitsdaten im Sinne des
   Art. 9 DSGVO werden im Rahmen dieser Push-Verarbeitung nicht
   verarbeitet.

## § 4 Weisungsbindung und Vertraulichkeit

1. Es gelten § 4 und § 5 des AVV Modell A (Weisungsbindung,
   Vertraulichkeit) entsprechend.

2. Der Verantwortliche stellt sicher, dass die Übermittlung der
   Geräte-Tokens an den Auftragsverarbeiter auf einer geeigneten
   Rechtsgrundlage erfolgt und auf die für die Push-Funktion erforderlichen
   Daten beschränkt ist.

## § 5 Speicherdauer und Löschung

1. Der Auftragsverarbeiter speichert Geräte-Tokens nur für die Dauer der
   Vertragsbeziehung bzw. bis zur Abmeldung des Geräts. Nicht mehr gültige
   Tokens (die Push-Dienste melden ungültige Tokens mit Fehlercodes zurück)
   werden unverzüglich gelöscht.

2. Nach Beendigung dieses AVV löscht der Auftragsverarbeiter alle bei ihm
   gespeicherten Geräte-Tokens und Versandmetadaten und weist die Löschung
   auf Verlangen nach.

## § 6 Unterauftragsverarbeiter

1. Für die Push-Zustellung setzt der Auftragsverarbeiter die in **Anlage 2
   zum Hauptvertrag** genannten Dienste Google/Firebase Cloud Messaging
   (FCM) und Apple Push Notification Service (APNs) ein. Diese sind als
   Unterauftragsverarbeiter in die genehmigte Liste aufgenommen.

2. Im Übrigen gilt § 7 des AVV Modell A entsprechend (vorherige
   Genehmigung, vertragliche Gleichverpflichtung, Haftung nach
   Art. 28 Abs. 4 DSGVO).

## § 7 Technische und organisatorische Maßnahmen

Der Auftragsverarbeiter trifft die in **Anlage 1 zum Hauptvertrag**
festgelegten technischen und organisatorischen Maßnahmen, soweit sie auf
die Push-Verarbeitung anwendbar sind. Insbesondere gelten die Maßnahmen zur
Datenminimierung (inhaltsleere Payloads, Ziffer 1.4 der Anlage 1) und zur
Verschlüsselung beim Transport.

## § 8 Unterstützung des Verantwortlichen

1. **Betroffenenrechte (Art. 15 bis 22 DSGVO):** Der Auftragsverarbeiter
   unterstützt den Verantwortlichen auf Weisung, insbesondere durch
   Löschung von Geräte-Tokens einzelner Betroffener.

2. **Meldung von Verletzungen (Art. 33, 34 DSGVO):** Der Auftragsverarbeiter
   meldet dem Verantwortlichen jede Verletzung des Schutzes personenbezogener
   Daten im Zusammenhang mit der Push-Verarbeitung unverzüglich nach
   Kenntniserlangung.

3. **Datenschutz-Folgenabschätzung (Art. 35 DSGVO):** Der Auftragsverarbeiter
   unterstützt den Verantwortlichen, soweit die Push-Verarbeitung Gegenstand
   einer Datenschutz-Folgenabschätzung ist.

## § 9 Nachweis- und Kontrollrechte

Es gelten § 10 des AVV Modell A (Nachweis- und Kontrollrechte) sowie § 11
(Haftung) und § 12 (Schlussbestimmungen) entsprechend.

---

[Ort, Datum]  —  [Name der Schule]  —  [Name des Anbieters]

[Unterschriften]

---

**Anlagen:** Anlage 1 (TOM), Anlage 2 (Unterauftragsverarbeiter),
Anlage 3 (Datenkategorien und Betroffene) — jeweils des Hauptvertrags;
für Modell B gelten die Anlagen nur, soweit sie die Push-Verarbeitung
betreffen.

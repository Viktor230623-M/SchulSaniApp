# Auftragsverarbeitungsspezifikation

## Anlage zum Auftragsverarbeitungsvertrag (AVV) nach Art. 28 Abs. 3 DSGVO

Alle Platzhalter in `[eckigen Klammern]` sind vor Verwendung auszufüllen.
Diese Anlage ist zusammen mit [avv-modell-a.md](avv-modell-a.md) bzw.
[avv-modell-b-push.md](avv-modell-b-push.md) zu verwenden und ergänzt
deren §§ 2 und 3.

---

## 1. Gegenstand (Art und Zweck) der Verarbeitung

Betrieb und Bereitstellung der Software **„SchulSaniApp“** zur Organisation
und Dokumentation des Schulsanitätsdienstes einer Schule:

- Verwaltung von Benutzerkonten, Rollen und Berechtigungen
  (Schulsanitäter:innen, Lehrkräfte, Schulleitung/Administration);
- Dienstplanung (Schichten, Vertretungen) und Dienststatus;
- Einsatzorganisation und Alarmierung (In-App-Benachrichtigungen,
  Push-Signale);
- Dokumentation von Einsätzen in Einsatzprotokollen (einschließlich
  Gesundheitsdaten, vgl. Ziffer 5);
- Abwesenheitsverwaltung (LOA) und schulinterne Nachrichten;
- Organisation von Treffen des Schulsanitätsdienstes über Nachrichten mit
  Terminfunktion und Teilnahme-Anmeldung (wer kommt, wann angemeldet);
- PDF-Export eingereichter Protokolle und Übergabe an die Schule.

**Betriebsmodelle:**

| Modell | Verarbeitung durch den Auftragnehmer (AN) |
|---|---|
| **A – Anbieter hostet** | Vollständiger Betrieb von Server und Datenbank für die Schule. |
| **B – Schule hostet selbst** | Der AN verarbeitet ausschließlich die für den Push-Versand erforderlichen Daten (Geräte-Tokens, inhaltsleeres Zustell-Signal) über seine zentralen FCM-/APNs-Konten. |

Die App wird im jeweiligen Modell für die Schule als Verantwortlichen
betrieben; die Gesundheitsinhalte der Einsatzprotokolle sind
Ende-zu-Ende-verschlüsselt, sodass der AN-Server sie technisch nicht im
Klartext lesen kann (vgl. Anlage 1).

---

## 2. Dauer der Verarbeitung

Für die Dauer des zugrunde liegenden Vertrags zwischen Auftraggeber (AG)
und Auftragnehmer (AN). Nach Vertragsende: Rückgabe/Löschung der Daten
gemäß AVV (vgl. Anlage 3, Ziffer 5 „Speicherdauer und Löschung“).

---

## 3. Ort der Verarbeitung

- Hauptverarbeitung (App- und Datenbankserver): `[Deutschland / Standort
  des vom AN betriebenen Servers — bitte eintragen]`.
- Native Push-Benachrichtigungen laufen über die zentralen Konten des AN
  bei Firebase Cloud Messaging (Google) und Apple Push Notification
  Service (Apple). Dabei ist eine Verarbeitung in Drittländern (insb.
  USA) nicht ausgeschlossen. Durch inhaltsleere Push-Payloads (kein
  Personenbezug im Zustell-Signal) wird die Übermittlung auf das
  technisch Notwendige minimiert (vgl. Anlage 2).

---

## 4. Kategorien betroffener Personen

- [x] **Mitarbeiter des AG** — Lehrkräfte, betreuende Personen des
      Schulsanitätsdienstes, Schulleitung, Verwaltung.
- [x] **Weitere Daten** (je eine Zeile):
  - Schulsanitäterinnen und Schulsanitäter (Nutzer:innen, i. d. R. minderjährig)
  - Schülerinnen und Schüler als Patient:innen (minderjährig)
  - Besucher:innen der Schule und sonstige bei Einsätzen versorgte Personen
  - Notfallkontakte (Name, Telefonnummer)

Nicht verarbeitet werden die Kategorien **Kunden**, **Interessenten**,
**Lieferanten**, **Externe Mitarbeiter**, **Auftragsverarbeiter** und
**Newsletter-Abonnenten** (die SchulSaniApp ist keine Vertriebs- oder
Marketing-Anwendung; die Schule als Kundin ist Verantwortliche, nicht
betroffene Person der Verarbeitung).

---

## 5. Kategorien personenbezogener Daten

- [x] **Namensdaten** — Vor-/Nachname von Nutzer:innen und Patient:innen.
- [ ] Geburtsdatum — nicht verarbeitet (nur Alter als Ganzzahl, s. u.).
- [ ] Bank- und Zahlungsdaten — keine Zahlungsabwicklung in der App.
- [ ] Standort und Geoinformationsdaten — keine GPS-Koordinaten;
      Einsatz-/Schichtort nur als Freitext (s. u.).
- [x] **Bildungsdaten** — Schulzugehörigkeit, Klasse der Patient:innen,
      Rolle im Schulsanitätsdienst.
- [ ] Verkehrsdaten — IP-Adressen und User-Agents werden bewusst **nicht**
      in Sitzungs- oder Anwendungslogs gespeichert.
- [ ] Strafrechtsrelevante Daten.
- [x] **Kontakt- und Adressdaten** — E-Mail-Adresse, optional Telefonnummer.
- [ ] Kundenvertragsdaten.
- [x] **Logindaten** — Benutzername, abgeleiteter Passwort-Proof
      (SHA-256, nie das Klartext-Passwort), Ableitungs-Salts,
      Sitzungs-Token nur als Hash.
- [ ] Daten zu Vorlieben und Verhaltensweisen — kein Tracking/Profiling.
- [ ] Bewegungsprofildaten.
- [ ] Foto- und Videodaten — keine Speicherung von Fotos/Videos.

**Weitere Daten** (je eine Zeile):

- Verschlüsselungsmaterial: öffentlicher Schlüssel, mit lokalem Schlüssel
  verschlüsselter privater Schlüssel, verpackte Datenschlüssel (DEK-Umschläge)
- Geräte-Tokens für Push-Benachrichtigungen (FCM/APNs/Web-Push) samt Plattform
- Einsatz-/Schichtort als Freitext (z. B. „Raum 12“, „Pausenhof“)
- Alter der Patient:innen als Ganzzahl (kein Geburtsdatum)
- Änderungs- und Zugriffsprotokolle (wer/wann/welche Aktion; Aufbewahrung 12 Monate)
- Meeting-Teilnahmen: Name und Anmeldezeitpunkt zu als Treffen markierten
  Nachrichten (Anmeldungen nur für Schulangehörige sichtbar; automatisiert
  gelöscht 90 Tage nach Meeting-Ende, bei Kontolöschung sofort)

---

## 6. Besondere Kategorien personenbezogener Daten (Art. 9 Abs. 1 DSGVO)

Es werden die folgenden besonderen Kategorien verarbeitet:

- [x] **Gesundheitsdaten** — Einsatzprotokolle: Patientendaten (Name,
      Klasse, Alter, Notfallkontakt), Beschwerdebild, Kategorie,
      Verletzungsstellen, Vitalzeichen (Puls, SpO2, Atemfrequenz,
      Blutdruck, AVPU, Schmerz), Maßnahmen, Behandlungsnotizen, Ergebnis,
      Nachträge, Zeugen.

**Hinweis zur Verarbeitung der Gesundheitsdaten:** Diese Inhalte sind
Ende-zu-Ende-verschlüsselt (vgl. Anlage 1). Der AN-Server speichert
ausschließlich das Chiffrat und kann den Klartext technisch nicht lesen;
im Klartext verarbeitet werden nur die zugehörigen Metadaten (Status,
Zeitstempel, Kennungen, Ort). Der Abruf und die Entschlüsselung erfolgen
ausschließlich auf dem Endgerät der berechtigten Person.

Nicht verarbeitet werden:

- [ ] Rassische und ethnische Herkunft
- [ ] Religiöse oder weltanschauliche Überzeugungen
- [ ] Genetische Daten
- [ ] Biometrische Daten
- [ ] Politische Meinungen
- [ ] Gewerkschaftszugehörigkeit
- [ ] Sexualleben oder sexuelle Orientierung

---

## Unterzeichnung

`[Ort, Datum]` — `[Schule / Auftraggeber]` / `[Anbieter / Auftragnehmer]`

Diese Spezifikation ist zusammen mit dem AVV zu unterzeichnen. Sie ersetzt
keine eigenständige Rechtsprüfung; insbesondere die Rechtsgrundlage
(Art. 6/9 DSGVO) und eine etwaige Datenschutz-Folgenabschätzung
(Art. 35 DSGVO) bestimmt der Verantwortliche (vgl. Anlage 3, Ziffer 4).

# Anlage 1 — Technische und organisatorische Maßnahmen (TOM)

## gemäß Art. 32 DSGVO

Die nachfolgenden Maßnahmen gelten für beide Betriebsmodelle (A und B),
soweit der Auftragsverarbeiter an der jeweiligen Verarbeitung beteiligt
ist. Sie sind Bestandteil des AVV.

---

## 1. Vertraulichkeit (Art. 32 Abs. 1 lit. b DSGVO)

### 1.1 Ende-zu-Ende-Verschlüsselung der Einsatzprotokolle (Gesundheitsdaten, Art. 9 DSGVO)

Die Einsatzprotokolle enthalten Gesundheitsdaten (Art. 9 DSGVO). Sie werden
**auf dem Endgerät** ver- und entschlüsselt; der Server speichert
ausschließlich Chiffrat. Das bedeutet: **Der Anbieter, sein Personal und
seine Unterauftragsverarbeiter können die Inhalte der Einsatzprotokolle
technisch nie im Klartext lesen.** Dies gilt unabhängig von allen übrigen
Maßnahmen (Transport-, Speicherverschlüsselung, Zugriffskontrolle) — es ist
eine zusätzliche, kryptografische Zugriffsschranke.

Umsetzung im Einzelnen:

- **Kryptografische Primitive:** ausschließlich libsodium
  (`crypto_secretbox` für Inhalte, `crypto_box_seal` für das Verpacken der
  Datenschlüssel, `crypto_pwhash`/Argon2id für Schlüsselableitung).
  Keine selbstgebauten kryptografischen Konstrukte.
- **Schlüsselhierarchie:** Pro Schule existiert ein symmetrischer
  Datenschlüssel (DEK). Der DEK wird für jede berechtigte Person mit deren
  öffentlichem Schlüssel verpackt (Envelope Encryption); der Server lagert
  nur die verpackten DEKs und kann sie nicht öffnen. Der DEK wird
  versioniert; bei Rotation entsteht eine neue Version.
- **Schlüsselquelle je Anmeldeweg:**
  - E-Mail + Passwort: zwei getrennte Argon2id-Ableitungen mit
    verschiedenen, zufälligen, pro Nutzer gespeicherten Salts — eine
    dient als Login-Nachweis an den Server, eine als
    Verschlüsselungs-Schlüssel. Das Passwort erreicht den Server nie in
    einer Form, aus der er den Verschlüsselungs-Schlüssel ableiten könnte
    (an den Server geht ausschließlich der abgeleitete Login-Proof).
  - OIDC (Google/Microsoft/Apple/IServ): separater, einmalig gesetzter
    Entsperr-Code, aus dem der Verschlüsselungs-Schlüssel abgeleitet wird.
    Der Entsperr-Code wird nur lokal verwendet und nicht an den Server
    übertragen. Passkey/PRF bleiben als spätere Option offen.
- **Speicherung:** Der Server speichert ausschließlich: öffentliche
  Schlüssel, mit dem abgeleiteten Schlüssel verschlüsselte private
  Schlüssel, Salts und verpackte DEKs — niemals einen Wert, mit dem er
  selbst entschlüsseln könnte.
- **Integrität und Authentizität:** Verwendung ausschließlich
  authentifizierter Verschlüsselung (AEAD: `secretbox`/`box_seal`);
  Chiffrat, dessen Authentifizierung fehlschlägt, wird verworfen und nie
  verwendet.
- **Wiederverwendung von Nonces:** Jedes Nonce/IV ist eindeutig und
  zufällig pro Verschlüsselung und wird nie wiederverwendet. Nonces werden
  nicht aus vorhersehbaren Werten abgeleitet.
- **Integrität der öffentlichen Schlüssel:** Beim Verpacken des DEK für
  andere Nutzer:innen wird sichergestellt, dass der verwendete öffentliche
  Schlüssel nachweislich zum Zielnutzer gehört (Schlüssel werden über den
  authentifizierten Kanal aus der eigenen Sitzung bezogen; ein stiller
  Austausch durch einen böswilligen Server ist damit ausgeschlossen).
- **Admin-Recovery (kein Hintertür-Mechanismus):** Verliert eine Person
  ihren privaten Schlüssel (Passwort-Reset ohne Wiederherstellungsmöglichkeit,
  Geräteverlust), können 2–3 berechtigte Admin-Rollen den DEK für die
  betroffene Person neu verpacken. Dies geschieht ausschließlich über einen
  berechtigten Admin-Client, der den DEK entpacken und neu verpacken kann;
  der Server allein ist hierzu nicht in der Lage. Es existiert kein
  Master-Schlüssel auf dem Server. Ohne diesen Mechanismus wäre ein
  Datenverlust unwiderruflich; er ist daher Teil des Konzepts.
- **Multi-Device:** Ein neues Gerät kann den privaten Schlüssel über den
  abgeleiteten Schlüssel (Passwort/Entsperr-Code) wiederherstellen; ist
  dies nicht möglich (z. B. Entsperr-Code verloren), erzeugt das neue
  Gerät ein eigenes Schlüsselpaar und ein bestehendes Gerät bzw. eine
  Admin-Rolle verpackt den DEK für das neue Gerät neu.
- **Folge für andere Funktionen:** PDF-Export erfolgt client-seitig nach
  der Entschlüsselung; serverseitige Suche oder Übersetzung über
  Protokollinhalte ist ausgeschlossen (und technisch unmöglich).

### 1.2 Bewusst im Klartext verarbeitete Metadaten (Transparenzpflicht)

Die Ende-zu-Ende-Verschlüsselung schützt die **Inhalte** der
Einsatzprotokolle. Folgende Metadaten werden bewusst **nicht verschlüsselt**
und liegen dem Server im Klartext vor; sie dürfen **nicht als anonym**
dargestellt werden:

- Nutzer-Stammdaten: Namen, E-Mail-Adressen, Benutzernamen, Rollen,
  Schulen;
- Organisationsdaten: Dienstpläne, Dienststatus, Abwesenheitsanträge,
  Einsatzdaten (Einsatz, Zeitstempel, Ort, beteiligte Personen als
  Kennungen);
- Protokoll-Metadaten: Status (Entwurf/eingereicht), Zeitstempel,
  Einsatzbezug, Autor:innen-/Responder-Kennungen;
- Technische Daten: Geräte-Tokens, IP-Adressen im Rahmen der
  Zugriffsprotokollierung, Sitzungsdaten;
- Zugriffs- und Änderungsprotokolle (Wer hat wann was gelesen oder
  geändert — Rechenschaftsnachweis nach Art. 5 Abs. 2 DSGVO).

Diese Metadaten sind personenbezogene Daten und unterliegen allen übrigen
Maßnahmen dieser Anlage (Zugriffskontrolle, Protokollierung, Löschfristen,
Transport-/Speicherverschlüsselung).

### 1.3 Rollenbasierte Zugriffskontrolle

- Zugriff auf Funktionen und Daten ausschließlich über Rollen mit
  feingranularen Berechtigungen (z. B. `reports.read_all`,
  `reports.see_patient_info`, `users.assign_role`).
- Die Trennung zwischen Personen mit und ohne Patientendaten-Zugriff
  erfolgt **über die Schlüsselverteilung**: Der DEK wird nur für
  berechtigte Rollen verpackt. Eine Person ohne DEK-Zugriff kann
  verschlüsselte Protokolle technisch nicht öffnen.
- Sichtbarkeitsgrenze (bewusste Folge, dokumentiert): Wer Protokolle
  lesen oder anlegen darf, erhält nach der Entschlüsselung Zugriff auf die
  Protokolle der Schule. Eine rein protokollbezogene Sichtbarkeit ist mit
  einem schulweiten Datenschlüssel nicht abbildbar; Schulen, die dies
  benötigen, wird eine Ein-Schlüssel-pro-Bereich-Variante (getrennte DEKs
  für Gesundheits- vs. Betriebsdaten) angeboten.
- Die SQL-Konsole (Owner-only) erhält keinen Zugriff auf die Rohdaten der
  Einsatzprotokolle; ein SQL-Guard erzwingt die Nutzung einer
  patientenfreien Sicht.

### 1.4 Datenminimierung bei Push-Benachrichtigungen

- Push-Payloads sind inhaltsleer: übermittelt wird nur ein neutrales
  Signal („Neue Meldung") und technische Bezeichner; keinerlei
  Personenbezug oder Inhalte.
- Der Anzeigetext wird erst von der App aus der verschlüsselten API
  geladen und lokal entschlüsselt. Dies minimiert zugleich das
  Drittland-Risiko bei FCM/APNs (vgl. Anlage 2).

### 1.5 Zugriffsprotokollierung

- Zugriffe auf Einsatzprotokolle (Liste, Detail, PDF/Export) werden mit
  Zeitstempel, Nutzer:in und Sichtbarkeit protokolliert
  (`report_access_log`); Aufbewahrung 12 Monate.
- Rollen- und Berechtigungsänderungen sowie Profilkorrekturen und
  Kontoverknüpfungen werden protokolliert (`role_change_log`,
  `profile_change_log`, `identity_change_log`); Aufbewahrung 12 Monate.
- Logs enthalten keine Passwörter, Schlüssel, Klartextinhalte oder
  abgeleiteten Schlüssel (bewusst unterdrücktes Logging, vgl.
  Vertraulichkeitskonzept).

### 1.6 Trennung von Umgebungen

- Entwicklung, Test und Produktion sind getrennt; Produktionsdaten werden
  nicht in Testumgebungen verwendet.

## 2. Integrität (Art. 32 Abs. 1 lit. b DSGVO)

- Authentifizierte Verschlüsselung (AEAD) aller verschlüsselten Inhalte;
  Manipulation führt zu einem Verwerfen des Chiffrats.
- Änderungen an Rollen und Berechtigungen werden protokolliert
  (Rechenschaftsnachweis).
- Versionskontrolle des Quellcodes; Änderungen laufen über Review.

## 3. Verfügbarkeit und Belastbarkeit (Art. 32 Abs. 1 lit. b DSGVO)

- Überwachung des Dienstes (Health-Check); automatischer Neustart
  (Prozessüberwachung).
- Backups mit Verschlüsselung (AES-256) und verschlüsseltem Transport;
  Backup-Daten enthalten nur Chiffrat der Protokollinhalte.
- Regelmäßige Wiederherstellungs-Tests.

## 4. Verschlüsselung beim Transport und bei der Speicherung

- **Transport:** TLS (HTTPS) für alle Verbindungen zwischen App, Web-App,
  API und externen Diensten. Push-Zustellung an FCM/APNs ausschließlich
  über TLS/HTTP-2 mit signierten JWT.
- **Speicherung:** Datenbank und Dateispeicher werden mit
  plattformüblicher Speicherverschlüsselung gesichert. Die
  Einsatzprotokoll-Inhalte sind zusätzlich durch die
  Ende-zu-Ende-Verschlüsselung geschützt (Ziffer 1.1).

## 5. Löschfristen (Art. 5 Abs. 1 lit. e, Art. 17 DSGVO)

| Datensatz | Frist | Automatisiert |
|---|---|---|
| Eingereichte Einsatzprotokolle | konfigurierbar, Standard gemäß Schulvorgabe; vor Löschung Export an die Schule | Ja (Job) |
| Protokoll-Entwürfe | kürzere Frist (z. B. 90 Tage ohne Bearbeitung) | Ja (Job) |
| Zugriffs-/Rollen-/Profil-Protokolle | 12 Monate | Ja (Job) |
| Abgelaufene Sitzungen / veraltete Tokens | unverzüglich bzw. kurze Frist | Ja |

- Die Löschung erfolgt durch einen automatisierten Job. Vor der Löschung
  eingereichter Protokolle wird ein vollständiger Export an die Schule
  übergeben bzw. ermöglicht.
- Die Löschung wirkt end-to-end: Ein Export beinhaltet die zugehörigen
  Schlüssel (verpackte DEKs), sodass die Schule auch nach Server-Löschung
  lesen kann; gelöschte Daten sind nicht aus Backups wiederherstellbar
  (Backup-Zyklen kürzer als Löschfristen, Löschung auch in Backups).

## 6. Personelle und organisatorische Maßnahmen

- Verpflichtung der Mitarbeitenden auf das Datengeheimnis (§ 5 BDSG /
  Art. 28 Abs. 3 lit. b DSGVO) bzw. Vertraulichkeit.
- Sensibilisierungsschulungen; dokumentierte Zuständigkeiten.
- Berechtigungsvergabe nach dem Need-to-know-Prinzip; regelmäßige
  Überprüfung der Berechtigungen.
- Incident-Response-Prozess für Verletzungen des Schutzes
  personenbezogener Daten (Meldung an den Verantwortlichen gemäß AVV § 8).

## 7. Kontinuierliche Überprüfung

- Die Wirksamkeit der Maßnahmen wird regelmäßig überprüft
  (Penetrationstests, Code-Reviews, Schwachstellen-Scans).
- Die Ende-zu-Ende-Verschlüsselung wird bei jeder Änderung am
  Verschlüsselungs- oder Schlüsselmanagement erneut geprüft
  (Sicherheits-Review-Checkliste, vgl. Dokumentation im Repo).

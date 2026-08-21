# Anlage 3 — Datenkategorien und Betroffene

## zum AVV (Modell A und Modell B)

Diese Anlage konkretisiert § 2 und § 3 des AVV. Sie ist bei jeder
Änderung des Datenmodells fortzuschreiben.

---

## 1. Verarbeitete Datenkategorien

| Kategorie | Beispiele (Felder) | Personenbezug | Besonderheit |
|---|---|---|---|
| **Nutzer-Stammdaten** | Name, E-Mail-Adresse, Benutzername, Telefonnummer, Rolle, Schule, Anmeldeweg (lokal/OIDC) | ja | Klartext (Metadaten) |
| **Kontodaten / Authentifizierung** | Passwort-Hash (nur abgeleiteter Login-Proof), Salt für Login-Ableitung, Salt für Verschlüsselungs-Ableitung, verschlüsselter privater Schlüssel, öffentlicher Schlüssel, verpackte Datenschlüssel (DEK) | ja (soweit zuordenbar) | kein Klartext-Passwort, keine unverschlüsselten privaten Schlüssel auf dem Server |
| **Organisationsdaten** | Dienstplan (Schichten), Dienststatus, Abwesenheitsanträge, Einsätze (Titel, Ort, Zeit, Priorität, Status), Einsatz-Aktivitäten | ja | Klartext (Metadaten) |
| **Einsatzprotokolle — Metadaten** | Status (Entwurf/eingereicht), Zeitstempel, Einsatzbezug, Autor:in/Responder (Kennungen), Ort | ja | Klartext (Metadaten) |
| **Einsatzprotokolle — Inhalte (Gesundheitsdaten)** | Patientendaten (Name, Klasse, Alter, Notfallkontakt), Beschwerdebild/Beschreibung, Kategorie, Verletzungsstellen, Vitalzeichen (Puls, SpO2, Atemfrequenz, Blutdruck, AVPU, Schmerz), Maßnahmen, Behandlungsnotizen, Ergebnis, Nachträge, Zeugen | ja | **Art. 9 DSGVO**; nur als Chiffrat (E2E-Verschlüsselung, Anlage 1 Ziffer 1.1) |
| **Benachrichtigungen** | In-App-Benachrichtigungen (Titel, Text, Typ), Push-Signale (nur technische Bezeichner) | ja | Push-Payloads inhaltsleer |
| **Meeting-Teilnahmen (Treffen)** | Bei als Treffen markierten Nachrichten: Name und Zeitpunkt der An-/Abmeldung je Teilnehmer:in | ja | Nur für die Organisation des Termins; Liste nur für Angehörige der Schule sichtbar; Anmeldungen automatisiert gelöscht (Ziffer 5) |
| **Geräte-Tokens** | FCM-/APNs-Token, Web-Push-Subscription, Plattform, Gerätekennung | ja | Klartext (Metadaten); gelöscht bei Abmeldung |
| **Protokoll- und Änderungsdaten** | Zugriffsprotokolle (Wer/wann/welches Protokoll), Rollen- und Berechtigungsänderungen, Profilkorrekturen, Kontoverknüpfungen | ja | Klartext; Aufbewahrung 12 Monate |
| **Technische Daten** | IP-Adressen, Sitzungsdaten (nur Hashes), Log-Daten | ja (IP) | Sitzungstokens nur als Hash gespeichert; IP nicht in Sitzungsdaten |

## 2. Betroffenenkategorien

| Kategorie | Beschreibung | Besonders zu beachten |
|---|---|---|
| **Minderjährige Schulsanitäter:innen** | Schüler:innen im Schulsanitätsdienst, nutzen die App aktiv | Einwilligung/Rechtsgrundlage nach Schulrecht; Schutz vor unangemessener Verarbeitung; Datenminimierung |
| **Minderjährige Patient:innen** | Schüler:innen, die versorgt werden und über die App dokumentiert werden | Gesundheitsdaten (Art. 9 DSGVO); nur Chiffrat; besonders strenge Zugriffskontrolle |
| **Volljährige Nutzer:innen** | Lehrkräfte, Schulleitung, weiteres Personal (auch als Patient:innen) | — |
| **Sonstige Betroffene** | Besucher:innen der Schule, die versorgt werden; Notfallkontakte (Name, Telefonnummer) | nur die für die Versorgung erforderlichen Daten |

## 3. Zwecke der Verarbeitung

1. Organisation und Durchführung des Schulsanitätsdienstes
   (Dienstplanung, Einsatzorganisation, Alarmierung);
2. Dokumentation von Einsätzen (Einsatzprotokolle, Nachträge);
3. Kommunikation innerhalb der Schule (Nachrichten, Benachrichtigungen);
4. Konten- und Berechtigungsverwaltung;
5. Erfüllung von Rechenschaftspflichten (Art. 5 Abs. 2 DSGVO) durch
   Protokollierung;
6. Datenexport und -übergabe an die Schule, Löschung nach Fristen.

## 4. Rechtsgrundlagen (Hinweis)

Die konkrete Rechtsgrundlage bestimmt der Verantwortliche. In Betracht
kommen insbesondere Art. 6 Abs. 1 lit. a (Einwilligung), lit. b
(Vertrag), lit. e (Wahrnehmung öffentlicher Aufgaben / schulrechtliche
Vorschriften) sowie für Gesundheitsdaten Art. 9 Abs. 2 lit. a, g, h
DSGVO in Verbindung mit den Vorschriften des jeweiligen
Landesschulrechts. Eine Datenschutz-Folgenabschätzung nach Art. 35 DSGVO
ist erforderlich (vgl. AVV § 8 Abs. 3).

## 5. Speicherdauer und Löschung

| Daten | Speicherdauer | Löschmechanismus |
|---|---|---|
| Eingereichte Einsatzprotokolle | konfigurierbar je Schule; Standard gemäß Schulvorgabe; vor Löschung Export an die Schule | automatisierter Job |
| Protokoll-Entwürfe | kürzere Frist (Standard: 90 Tage ohne Bearbeitung) | automatisierter Job |
| Zugriffs-/Rollen-/Profil-/Identitäts-Protokolle | 12 Monate | automatisierter Job |
| Abwesenheitsanträge, Einsätze | bis zur Löschung gemäß Schulvorgabe | Löschung durch Verwalter:innen |
| Geräte-Tokens | bis zur Abmeldung des Geräts; ungültige Tokens unverzüglich | Löschung bei Abmeldung/Fehlercode |
| Meeting-Teilnahmen (Treffen) | 90 Tage nach Meeting-Ende (ohne Endzeit: nach Beginn); bei Kontolöschung sofort | automatisierter Job; Anonymisierung im Kontolöschungsvorgang |
| Sitzungen | bis zum Ablauf der Sitzungsfrist (Sliding + absolut) | automatisierte Löschung |
| Nutzerkonten | bis zur Löschung durch Verwalter:innen (Löschung kaskadiert abhängige Daten) | Löschfunktion |

Hinweis: Aufgrund der Ende-zu-Ende-Verschlüsselung ist die Löschung
wirksam: Gelöschte Protokolle sind auch aus Backups nicht mehr lesbar
(Backup-Zyklen kürzer als Löschfristen). Exporte an die Schule enthalten
die zugehörigen verpackten Datenschlüssel, sodass die Schule die
übergebenen Daten weiterhin lesen kann.

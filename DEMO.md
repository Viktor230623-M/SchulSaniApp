# DEMO.md — 5-Minuten-Demo für den Schulleiter

Ablauf (5 Minuten, Live-Demo auf dem Demo-Tenant mit Dummy-Daten). Ziel: zeigen, dass
Einsatz-Alarm, Dokumentation, PDF-Export und Dienstplan in einer App funktionieren — und
die drei unbequemen Fragen beantwortet sind.

## Vorbereitung (vor dem Termin)

- Demo-Tenant frisch seeded: Dummy-Schüler (z. B. "M. Mustermann", "L. Musterfrau"),
  mind. 1 offener Einsatz, 1 erledigtes Protokoll mit PDF, 1 Woche Dienstplan, 2
  Abwesenheitsanträge. **Keine echten Namen.**
- Zwei Rollen eingeloggt auf zwei Geräten oder zwei Browser-Tabs:
  - A = "Schulsanitäter" (empfängt Alarm, protokolliert)
  - B = "Schulleitung" (sieht Berichte, freigibt Benutzer)
- Venue-WLAN-Fallback: Handy-Hotspot vorbereitet, Zugangsdaten auf einem Zettel dabei.
  Eingaben im Protokoll werden verschlüsselt auf dem Gerät als Entwurf gesichert und
  nach einem Neustart wiederhergestellt. Wenn gar kein Netz verfügbar ist: vorbereitete
  Screenshots auf dem Gerät + Kurzversion ohne Live-Alarm ("bildlich zeigen").
- Projektor: 1024×768 vorab prüfen. Die App bleibt auf 375–393 px lesbar; für die Demo
  Browser-Zoom auf 90 % stellen und keine vertraulichen Browser-Tabs zeigen.

## Ablauf (00:00–05:00)

**00:00 — Der Hook (30 s)**
Anstelle einer Durchsage kommt ein Alarm. Live machen: Rolle A öffnet "Einsätze", ein
Alarm kommt rein (vorher über Rolle B–Anzeige oder direkt in der App auslösen, sonst
auf dem Demo-Tenant einen echten Alarm erzeugen und 30 s warten — Push anzeigen).

**01:00 — Einsatz annehmen → Protokoll (1:30)**
Rolle A: Annehmen (Tipp), dann "Dokumentieren und abschließen". Formular läuft durch:
Patient (Dummy), Situation, Bewusstsein/AVPU, Schmerz, Maßnahmen. Sagen: "Alles, was
jetzt eingegeben wird, ist Ende-zu-Ende verschlüsselt — wir als Betreiber sehen nie
den Inhalt. Das sehen Sie am Schloss-Symbol."

**02:30 — PDF-Export (1:00)**
Protokoll abschließen → "PDF teilen". Datei öffnen (AirDrop/Mail/Dateien). Sagen:
"Das Protokoll ist ab jetzt unveränderlich — wer es nachträglich ergänzt, schreibt
ein kommentiertes Addendum mit Zeitstempel. Ideal für die Dokumentenpflicht der Schule."

**03:30 — Dienstplan + Rechte (1:00)**
Rolle A→Dienstplan: Schicht, Vertretung. Zeigen, dass der Schüler nichts Administratives
sieht (kein Benutzer-Tab). Rollenwechsel zu B (Schulleitung): Freischaltung eines neuen
Schülers, Berichts-Übersicht. Sagen: "Jeder sieht nur, wofür seine Rolle berechtigt ist.
Das ist serverseitig durchgesetzt, nicht nur versteckt."

**04:30 — Abschluss & Sicherheitsversprechen (30 s)**
"Drei Dinge, die uns von einer Bastel-App unterscheiden: Ende-zu-Ende-Verschlüsselung,
serverseitige Rechte je Rolle, und vollständige Nachvollziehbarkeit (wer hat wann was
gesehen). Die Schule bleibt datenschutzrechtlich Verantwortliche — Sie entscheiden,
wir verarbeiten nur im Auftrag."

## Die drei unbequemen Fragen (Antwortvorlage)

**1. "Wo werden unsere Daten gespeichert?"**
Die genaue Hosting-Region steht im AVV des jeweiligen Tenants. Vor dem Termin
muss sie mit dem Kundenvertrag übereinstimmen. Einsatzinhalte liegen auf dem Server
verschlüsselt; der Betreiber kann sie ohne freigegebenen Datenschlüssel nicht lesen.
Metadaten wie Konto, Rolle, Einsatzzeit und Schicht werden für den Betrieb benötigt.
Missionstexte können je nach Konfiguration zusätzlich an den eingetragenen
LibreTranslate-Dienst gesendet werden. Das muss vor dem Kundentermin dokumentiert
oder deaktiviert sein.

**2. "Was passiert, wenn ein Schüler die App missbraucht?"**
Alle Aktionen sind rollenbasiert und protokolliert: Wer wann welches Protokoll
gesehen hat, steht im Zugriffslog (für die Leitung einsehbar). Ein Schüler kann
fremde Protokolle weder sehen noch ändern — serverseitig gesperrt, nicht nur
versteckt. Richtet ein Schüler Schaden an (z. B. Fake-Alarm), greifen dieselben
Regeln wie bei jedem anderen Fehlverhalten; die App liefert den Nachweis, wer
was ausgelöst hat. Hinweis: Push-Alarme aus Spaß sind über die Schicht-Logik
einschränkbar (Bereitschaftsplan).

**3. "Wer haftet, wenn Inhalte falsch sind?"**
Die App enthält **keine** medizinischen Anleitungen oder Dosierungen — sie
dokumentiert den Einsatz der ausgebildeten Sanitäter. Sie ersetzt keine
Ausbildung und behauptet das auch nicht (Hinweis direkt im Protokoll). Die App enthält keine medizinischen Anleitungen und ersetzt keine Ausbildung.
Wer für die konkrete Erste-Hilfe-Maßnahme haftet, muss die Schule mit ihrer
Versicherung und ihrem Rechtsbeistand klären. Der Betreiber darf im Termin keine
Haftungszusage machen. Der AVV muss Verantwortlichkeiten und Löschfristen nennen;
die aktuelle App löscht Protokolle über Export- und Retention-Regeln, nicht nach
beliebigen Aussagen in dieser Demo-Datei.

## Notfall-Cheatsheet (wenn die Live-Demo klemmt)

- Alarm kommt nicht an: → Rolle B, neuer Einsatz direkt anlegen und Push prüfen;
  wenn Push tot: Web-Tab als Fallback, Alarm dort sichtbar.
- Netz weg: → Eingaben bleiben als verschlüsselter lokaler Entwurf erhalten; keine
  Übertragung als erfolgreich ausgeben. Danach Hotspot. Hotspot auch tot: Screenshot-
  Kurzdemo (s. o.).
- Falscher Inhalt im Demo-Datensatz: → Demo sofort abbrechen, Datensatz löschen und
  mit dem geprüften Seed neu starten. Niemals echte Schülerdaten als Ersatz verwenden.
- Gerät leer: → zweites Gerät liegt bereit (vorher geladen, Demo-Tenant dort eingeloggt).

## Checkliste Demo-Tag

- [ ] Demo-Tenant seeded, beide Rollen eingeloggt
- [ ] Offener Einsatz vorbereitet (nicht angenommen)
- [ ] Ein fertiges Protokoll + PDF vorhanden
- [ ] Hotspot-Daten auf Papier dabei
- [ ] Ersatzgerät geladen + geloggt (falls Hauptgerät stirbt)
- [ ] Neuer Schüler für "Freischaltung live" angelegt (auf "pending")
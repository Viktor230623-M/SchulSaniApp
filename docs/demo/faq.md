# Demo FAQ — Fragen, die kommen können (und die Antworten dahinter)

Ziel: Du sollst die Antworten **verstehen**, nicht auswendig lernen. Zu jeder
Frage steht erst die einfache Erklärung, dann ein Satz zum Sagen.

---

## 1. „Was kostet das?"

**Verstehen:** Es gibt feste Preise:
- **Gehostet** (ich betreibe Server + Datenbank): **299 € pro Jahr**
- **Self-Hosted** (Schule betreibt auf eigenen Servern): **399 € pro Jahr**
- **Setup + Team-Einführung** (einmalig): **149 €**

Die Demo und das erste Gespräch bleiben kostenlos und unverbindlich. Erst bei einer echten Einführung greifen die Preise.

**Sagen:** „Gehostet kostet es 299 Euro pro Jahr, wenn Sie es selbst hosten 399. Dazu kommt einmalig 149 Euro für Setup und die Einführung Ihres Teams. Die Demo davor ist kostenlos und unverbindlich."

---

## 2. „Wie kommen die Schüler in die App?"

**Verstehen:** Die Schule bekommt einen Schul-Zugang (einen Tenant). Die Lehrkraft/Schulleitung lädt Schüler per Einladung ein — jeder bekommt ein Einmal-Passwort, mit dem er sich das erste Mal anmeldet und dann ein eigenes Passwort setzt. Niemand kann sich einfach so einer Schule hinzufügen.

**Sagen:** „Sie laden Ihre Sanitäter:innen per Einladung ein. Jede Person bekommt ein einmaliges Passwort, richtet sich dann ihr eigenes ein. Fremde kommen nicht rein."

---

## 3. „Was passiert mit den Daten? Wer kann sie lesen?"

**Verstehen:** Das ist das Kernstück: Die Einsatzprotokolle sind **Ende-zu-Ende-verschlüsselt**. Das heißt: Das Protokoll wird auf dem Handy des Sanitäters verschlüsselt, bevor es zum Server geht. Der Server (also ich) kann den Inhalt **technisch nie lesen** — nur die Geräte der Schule können entschlüsseln. Selbst wenn jemand den Server hackt, sieht er nur verschlüsselte Zeichen. Der Schlüssel entsteht aus dem Passwort des Nutzers (Argon2id) und bleibt auf dem Gerät.

**Sagen:** „Die Protokolle werden auf dem Handy verschlüsselt und erst dort wieder entschlüsselt. Nicht mal ich kann den Inhalt lesen — der Server speichert nur verschlüsselte Daten. Selbst ein Server-Hack gäbe keinen Zugriff auf die Inhalte."

---

## 4. „Wie lange werden die Daten gespeichert?"

**Verstehen:** Es gibt automatische Löschfristen (im Code fest programmiert, vertraglich zugesagt):
- Eingereichte Protokolle: **5 Jahre** nach Jahresende (gesetzliche Aufbewahrung)
- Entwürfe: **30 Tage** nach letzter Änderung
- Einsätze ohne Protokoll: **12 Monate**
- Benachrichtigungen: **90 Tage**
- Abwesenheitsanträge: **bis 2 Jahre** (Schuljahresende + 1 Jahr)
- Protokolle von Rollen-/Namensänderungen: **12 Monate**
- Abgemeldete Sitzungen: **30 Tage**

**Sagen:** „Alles wird automatisch gelöscht — Protokolle nach 5 Jahren (das ist die gesetzliche Frist), Entwürfe schon nach 30 Tagen, Benachrichtigungen nach 90 Tagen. Ich lösche nicht manuell, das System macht es automatisch."

---

## 5. „Und die DSGVO? Wer ist verantwortlich?"

**Verstehen:** Das ist die wichtigste juristische Sache. Bei Gesundheitsdaten (Art. 9 DSGVO) gilt: **Die Schule bleibt die „Verantwortliche"** — sie entscheidet, was mit den Daten passiert. Ich (SchulSaniApp) bin nur der **„Auftragsverarbeiter"** — ich handle im Auftrag der Schule. Dafür gibt es einen Vertrag nach **Art. 28 DSGVO** (Auftragsverarbeitungsvertrag, AVV). Das ist kein Marketing — das ist das Standard-Modell, wie Schulen mit Software-Anbietern arbeiten (z.B. auch bei Schulverwaltungssoftware).

**Sagen:** „Ihre Schule bleibt datenschutzrechtlich Verantwortliche. Ich bin Auftragsverarbeiter — dafür schließen wir einen Vertrag nach Art. 28 DSGVO, wie es bei Schulsoftware üblich ist."

---

## 6. „Brauchen wir eigene Server?"

**Verstehen:** Zwei Modelle:
- **Modell A:** Ich hoste alles (Server in Frankfurt/EU). Schule = Verantwortliche, ich = Auftragsverarbeiter.
- **Modell B (Self-Hosting):** Die Schule betreibt die App auf eigenen Servern. Nur die Push-Benachrichtigungen laufen über meine zentralen Konten (Google/Apple) — dafür gibt es einen kleineren, auf Push beschränkten Vertrag.

**Sagen:** „Beides geht: Ich hoste (Server in Frankfurt, EU), oder Ihre Schule hostet selbst auf eigenen Servern. Die automatische Löschung bleibt in beiden Fällen aktiv."

---

## 7. „Was, wenn das Internet oder der Server ausfällt?"

**Verstehen:** Das musst du ehrlich beantworten: Die App braucht Internet für Alarm und Sync. Was es gibt: Die App ist eine PWA/Web-App, die lokal cached — aber für die Kernfunktionen (Alarm, Protokoll-Sync) braucht sie Verbindung. Ein Schulserver-Ausfall (Modell A) ist bei einem Anbieter mit EU-Hosting selten. Du solltest NICHT behaupten, dass alles offline funktioniert.

**Sagen:** „Die App braucht Internet für Alarm und Synchronisation. Der Server steht in Frankfurt bei einem EU-Anbieter — Ausfälle sind dort selten. Aber ganz ehrlich: Für den absoluten Notfall bleibt das Papierprotokoll als Rückfallebene — die App ersetzt den Zettel, schafft aber keine neue Abhängigkeit, die schlimmer wäre als heute."

---

## 8. „Wie sicher sind die Passwörter? Was, wenn jemand sein Handy verliert?"

**Verstehen:** Passwörter werden mit Argon2id (dem aktuellen Standard) gehasht — der Server speichert nie das Passwort selbst, nur einen nicht-umkehrbaren Hash. Verliert jemand sein Gerät: Der Verschlüsselungsschlüssel liegt auf dem Gerät, daher kann die Person von einem neuen Gerät ihre alten verschlüsselten Protokolle nicht mehr entschlüsseln — die Schule kann aber per Admin den Zugang zurücksetzen. Das ist ein Sicherheitsfeature, kein Bug: Verlorene Geräte bedeuten keinen Datenverlust für andere.

**Sagen:** „Passwörter werden nie im Klartext gespeichert, nur als kryptografischer Hash — der aktuelle Standard (Argon2id). Verliert jemand sein Handy, kann der Admin den Zugang zurücksetzen. Die alten Protokolle bleiben verschlüsselt und sicher."

---

## 9. „Kann eine andere Schule unsere Daten sehen?"

**Verstehen:** Nein — und das ist durch Tests bewiesen. Jede Schule ist ein eigener „Mandant" (eigener Bereich). Jede Anfrage an den Server trägt die Schul-Kennung, und der Server prüft bei jeder Abfrage, dass nur Daten der eigenen Schule zurückkommen. Es gibt Integrationstests, die genau das prüfen: Schule A kann Schule B nicht sehen — auch wenn jemand manipuliert.

**Sagen:** „Jede Schule hat ihren eigenen abgeschotteten Bereich. Das ist durch automatisierte Tests abgesichert, die genau prüfen: Schule A kommt nie an die Daten von Schule B."

---

## 10. „Wie funktioniert der Alarm? Was, wenn das Handy stumm ist?"

**Verstehen:** Ehrlich: Push funktioniert über Google (Android) und Apple (iOS). Auf Android kann der Alarm mit hoher Priorität auch bei lautlosem Handy durchkommen. Auf iOS gibt es eine Einschränkung: Apple erlaubt „Critical Alerts" nur mit Sondergenehmigung — normal priorisierte Push kommt bei lautlos nicht durch. Das solltest du NICHT verstecken, sondern offen ansprechen und als „auf der Roadmap" einordnen.

**Sagen:** „Auf Android kommt der Alarm auch bei stumm geschaltetem Handy durch. Auf iOS ist Apple hier strenger — einen echten Notfall-Alarm über die Stummschaltung hinweg gibt es dort erst mit einer Sondergenehmigung von Apple, das ist auf meiner Liste. In der Praxis hat jede Schule zusätzlich ihr bestehendes Meldeverfahren als Rückfallebene."

---

## 11. „Läuft das auf Android und iPhone?"

**Verstehen:** Ja — Expo/React-Native, also eine echte App für beide Plattformen, plus die Web-Version (läuft im Browser ohne Installation, als PWA). Die Demo unter demo.schulsaniapp.com IST die Web-Version.

**Sagen:** „Ja — Android, iPhone und zusätzlich im Browser ohne Installation. Die Demo, die Sie sich ansehen, ist dieselbe App."

---

## 12. „Wer kann was sehen?"

**Verstehen:** Es gibt Rollen: Schulsanitäter:in, Leitung, Lehrkraft, Admin. Jede Rolle sieht nur das, was sie braucht. Die Leitung/Lehrkraft sieht Protokolle zur Freigabe, der Admin verwaltet Rollen und Zugänge. Ein normaler Sanitäter sieht nicht alle Verwaltung.

**Sagen:** „Jede Rolle sieht nur das Nötige: Sanitäter:innen ihre Einsätze und Protokolle, die Leitung die Freigabe, die Lehrkraft die Übersicht, der Admin die Verwaltung."

---

## 13. „Was passiert mit den Protokollen am Ende?"

**Verstehen:** Protokolle werden als PDF exportiert — einzeln oder gebündelt. Die Schule bestimmt, wann sie den Export bekommt (halbjährlich, jährlich, nach 5 Jahren). Nach dem Download werden die Daten bei mir gelöscht. Das erfüllt die Dokumentationspflicht der Schule, ohne dass die Daten dauerhaft bei einem Dritten liegen.

**Sagen:** „Sie bekommen Ihre Protokolle als PDF-Bündel — wann Sie wollen, halbjährlich, jährlich oder nach fünf Jahren. Nach dem Download werden die Daten bei mir gelöscht. Die Dokumentation gehört dann Ihnen, nicht mir."

---

## 14. „Wie lange dauert die Einrichtung?"

**Verstehen:** Die Schule bekommt einen eigenen Bereich (Tenant), die Lehrkraft richtet Rollen ein, lädt die Sanitäter:innen ein. Realistisch: wenige Tage bis zur ersten Nutzung, der Aufbau des Dienstes selbst (Ausbildung der Sanis) ist Sache der Schule.

**Sagen:** „Die technische Einrichtung geht schnell — Sie bekommen Ihren Bereich, laden Ihre Sanitäter:innen ein. Wie schnell der Dienst selbst steht, hängt davon ab, ob er schon existiert oder erst aufgebaut wird."

---

## 15. „Was ist mit Schülerdaten und Minderjährigen?"

**Verstehen:** Das ist Gesundheitsdaten-Verarbeitung bei Minderjährigen — der strengste Bereich der DSGVO (Art. 9). Deshalb: Schule als Verantwortliche, AVV nach Art. 28, Ende-zu-Ende-Verschlüsselung, automatische Löschung, EU-Server. Das ist genau der Grund, warum das Konzept so aufgebaut ist. Du musst hier vorsichtig sein: Nicht behaupten, dass alles „automatisch DSGVO-konform" ist — sagen, dass das Konzept genau dafür gebaut ist und die Dokumentation vorliegt.

**Sagen:** „Genau deshalb ist das Konzept so aufgebaut: Schule als Verantwortliche, verschlüsselte Protokolle, automatische Löschung, Server in der EU. Die Datenschutz-Dokumentation (AVV, technische Maßnahmen, Löschkonzept) liegt vor — die kann ich Ihnen gerne zeigen."

---

## 16. „Wie viele Schulen nutzen das schon?"

**Verstehen:** Ehrlich bleiben. Es gibt das Gymnasium Blankenese als Referenz (deine Schule, etablierter SSD), und erste Gespräche mit anderen Schulen. NICHT übertreiben.

**Sagen:** „An meiner Schule, dem Gymnasium Blankenese, ist der Schulsanitätsdienst etabliert und die App ist dort im Einsatz. Mit mehreren Schulen bin ich gerade im Gespräch."

---

## 17. „Was, wenn du aufhörst oder die Schule wechselt?"

**Verstehen:** Die Schule hat jederzeit alle Daten als PDF-Export. Und mit Modell B (Self-Hosting) kann die Schule die App komplett auf eigenen Servern betreiben — dann ist keine Abhängigkeit von mir da. Der Export ist die Absicherung.

**Sagen:** „Ihre Daten gehören Ihnen: Sie bekommen jederzeit den vollständigen Export als PDF. Und wenn Sie es ganz unabhängig wollen, können Sie die App selbst hosten — dann läuft alles auf Ihren Servern."

---

## 18. „Wer steckt dahinter? Ist das eine Firma?"

**Verstehen:** Ehrlich: Es ist ein Schüler, der das allein entwickelt hat. Das kann ein Plus sein (persönlich, schnell, günstig) oder eine Sorge (Kontinuität). Du solltest es nicht verstecken, sondern selbstbewusst einordnen: Allein entwickelt, aber mit Tests, Datenschutz-Konzept und der Referenzschule. Der §-112-BGB-Antrag (selbstständiger Betrieb) läuft — aber das erwähnst du nur, wenn es passt.

**Sagen:** „Ich bin Schüler am Gymnasium Blankenese und habe die App allein entwickelt — mit über 130 automatisierten Tests und einem vollständigen Datenschutz-Konzept. Bei meiner Schule ist sie im Einsatz. Ich baue das gerade als eigenes Unternehmen auf."

---

## 19. „Warum ist die App besser als Papier/Excel?"

**Verstehen:** Die drei konkreten Schmerzpunkte: (1) Durchsage → wer hat es gehört? Push löst das. (2) Zettel-Protokolle → gehen verloren, unleserlich; digitales Protokoll am Handy, PDF-Export. (3) Dienstplan in Excel/WhatsApp → wer ist wann da, wer springt ein; die App zeigt es. Das sind die drei Sätze, die du im Gespräch wiederholen kannst.

**Sagen:** „Drei Dinge: Der Alarm kommt als Push aufs Handy statt über die Durchsage. Das Protokoll wird am Ort des Geschehens am Handy ausgefüllt und als PDF exportiert — nichts geht verloren. Und Dienstplan samt Vertretung laufen in derselben App statt in Excel."

---

## 20. „Können wir das erstmal testen?"

**Verstehen:** Ja — genau dafür gibt es die Demo. demo.schulsaniapp.com startet direkt eingeloggt mit Beispieldaten, kein Konto nötig. Danach kann ein echter Test-Zugang mit den Daten der Schule eingerichtet werden.

**Sagen:** „Gerne. Sie können sich die Demo direkt ansehen unter demo.schulsaniapp.com — ohne Anmeldung. Wenn Sie wollen, richte ich Ihnen danach einen Test-Zugang mit den Daten Ihrer Schule ein."

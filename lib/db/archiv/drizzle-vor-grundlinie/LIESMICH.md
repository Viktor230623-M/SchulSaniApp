# Archiv: Migrationen vor der Grundlinie

Diese Dateien sind **nicht mehr gueltig** und werden von keinem Werkzeug
gelesen.

Stand vom 01.08.2026: `meta/_journal.json` kannte nur `0000_natural_scream`.
`0001` bis `0003` standen nie im Journal und wurden nie ueber den Migrator
ausgefuehrt.

`0000` legte sechs Tabellen an, zwei davon unter Namen, die es in der
Produktion nie gab (`duty_entries`, `loa_requests`).

Der Inhalt von `0001` (Sicht `incident_reports_admin`) und der
Tabellenkommentar aus `0002` sind in `lib/db/drizzle/0001_sicht_und_kommentare.sql`
uebernommen worden.

`0003` haelt fest, warum der Aufzaehlungstyp `notification_type` zwei Werte
nachtraeglich bekommen hat. Diese Werte sind in der Grundlinie enthalten.

Die gueltige Grundlinie liegt in `lib/db/drizzle/`.

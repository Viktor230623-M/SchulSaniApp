# Row-Level-Security (RLS) für die SchulSaniApp

Zweite Verteidigungslinie gegen Tenant-Leaks. Die Isolation hängt heute
vollständig an den `eq(schoolId)`-Filtern der Anwendung. RLS soll greifen,
wenn ein solcher Filter einmal vergessen wird — nicht, um die App-Filter zu
ersetzen.

## Warum das nicht automatisch per Migration aktiviert wird

RLS sinnvoll einzuschalten braucht drei Dinge, die sich nicht blind in einer
Migration erledigen lassen:

1. **Eigene DB-Rolle.** Die Anwendung verbindet sich heute mit der Rolle, die
   auch die Migrationen anwendet (Tabellen-Eigentümer). Der Eigentümer umgeht
   RLS, solange nicht `FORCE ROW LEVEL SECURITY` gesetzt ist. Erst eine
   dedizierte, nicht-eigentümliche Rolle (`app_role` + `GRANT`s) lässt die
   Policies überhaupt greifen.
2. **Request-Kontext.** Die Policies lesen `current_setting('app.current_school_id')`.
   Das muss je Anfrage innerhalb einer Transaktion (`SET LOCAL`) gesetzt werden.
   Der Server arbeitet heute ohne solche Transaktions-Klammern — das ist ein
   eigener Umbau.
3. **Backfill.** `users`, `roles`, `user_identities` und die drei Audit-Log-
   Tabellen haben nullable `school_id`. Altzeilen stehen auf `NULL` und würden
   bei aktivierter Enforcement unsichtbar (= Datenverlust aus Nutzersicht).

`FORCE ROW LEVEL SECURITY` oder falsche Policies wären genau der Datenverlust,
den es zu vermeiden gilt. Deshalb wird RLS in zwei Phasen ausgerollt.

## Phase A — Fundament (sicher, inert)

`enable-rls.sql` legt die Helfer-Funktion und die Policies an und schaltet
`ENABLE ROW LEVEL SECURITY` ein — bewusst **ohne** `FORCE` und ohne gesetzten
Kontext.

Warum das gefahrlos ist:

- Läuft die App als Eigentümer, greift RLS für sie gar nicht (Eigentümer
  umgeht es ohne `FORCE`).
- Läuft die App als Nicht-Eigentümer, ist die Policy permissiv, solange
  `app.current_school_id` nicht gesetzt ist (`... IS NULL OR ...`) — es wird
  also keine Zeile ausgeblendet.

In beiden Fällen ändert sich am Verhalten **nichts**. Die Policies stehen aber
schon korrekt da, damit Phase B nur noch den Kontext setzt.

Anwendung: auf dem Server (`SchulSaniApp-Server`) nach `git pull`:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/rls/enable-rls.sql
```

Danach verhalten sich alle Queries unverändert. Erst weitergehen, wenn das
bestätigt ist.

## Phase B — Enforcement (separater, getesteter Schritt)

Erst nach Phase A und nur mit Tests auf einer Kopie der Datenbank:

1. `app_role` anlegen (kein Tabellen-Eigentümer), `GRANT SELECT/INSERT/UPDATE/DELETE`
   auf alle Tabellen, `GRANT USAGE` auf die Sequenzen, falls welche entstehen.
2. Der Server verbindet sich als `app_role` (`SET ROLE app_role` nach dem
   Verbinden oder eigener Connection-String).
3. Pro Anfrage: Transaktion öffnen, `SELECT set_config('app.current_school_id',
   <schoolId>, true)` (bzw. `SET LOCAL`) und die Queries darin ausführen.
   Der Wert kommt ausschließlich aus der Sitzung (`schoolIdOf`), nie vom Client.
4. `school_id` der drei Audit-Log-Tabellen und ggf. `users`/`roles`/`user_identities`
   zurückfüllen, damit Altzeilen nicht unsichtbar werden.
5. Entscheidung über `FORCE ROW LEVEL SECURITY` je Rolle festhalten.
6. Tenant-Isolations-Tests (`tenantIsolation.integration.test.ts`) gegen die
   Kopie laufen lassen, bevor die Rolle in Produktion umgestellt wird.

## Offene Punkte für Phase B

- **Globale Rollen:** `roles` darf weiterhin `school_id IS NULL`-Zeilen lesen.
  Die Policy lässt das bereits zu.
- **`users`/`user_identities` mit `NULL`-school_id:** vor Enforcement prüfen,
  ob solche Zeilen existieren, und entweder zuordnen oder die Policy anpassen.
- **Login/Registrierung** laufen ohne Schulkontext in der Sitzung. Diese
  Abfragen (per `schoolIdFromRequest` aus Body/Query) müssen in Phase B vom
  RLS-Kontext ausgenommen oder mit `SET LOCAL` vorbereitet werden.

## Bewertung

Phase A ist sicher und kann jederzeit angewendet werden. Phase B ist ein
eigener, zu testender Rollout. Erst mit Phase B ist RLS tatsächlich
Enforcement; vorher bleibt es eine vorbereitete, aber inaktive Verteidigung.

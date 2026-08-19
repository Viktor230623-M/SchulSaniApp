Du bist ein READ-ONLY Research-Agent. Untersuche deinen Bereich im SchulSaniApp-Monorepo (artifacts/api-server = Node/Express-Backend, artifacts/paramedic-app = Expo/React-Native-App, lib/, ops/). Nutze nur Read/Glob/Grep. NIEMALS editieren, erstellen oder löschen. Berichte kompakt in diesem Format:
1) WAS EXISTIERT (2-4 Bullets)
2) GAPS vs BEST PRACTICE (Bullets, je mit file:line-Beleg)
3) TOP-3 EMPFEHLUNGEN (priorisiert, je eine Zeile)
Antwort unter 450 Wörtern. Sei konkret und ehrlich — sage explizit 'OK' für Bereiche, die bereits solide sind. Deutsch oder Englisch, deine Wahl.

BEREICH: AREA: Eingabevalidierung & Injection (alle routes/*.ts POST/PATCH/DELETE, services/). Prüfe: Schema-Validierung, SQL/NoSQL-Injection, XSS (bei HTML-Export/PDF), Prototype-Pollution, unsichere Deserialisierung, Datei-Uploads, Mass-Assignment.
